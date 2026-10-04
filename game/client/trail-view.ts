import * as THREE from 'three';
import type { RoomSnapshot } from '../shared/protocol';
import { FLASHLIGHT_PROFILE as BEAM } from '../shared/street-layout';
import { groundBeamStrength, groundHeight, MAX_FOOTPRINTS } from '../shared/trails';

/** World-space, beam-clipped ground details. Two bounded instanced draws, no lights. */
export class TrailView {
  private readonly footprints: THREE.InstancedMesh;
  private readonly marks: THREE.InstancedMesh;
  private readonly materialUniforms: { beamCount: { value: number } }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly beams = Array.from({ length: 6 }, () => new THREE.Vector4());
  private snapshot?: RoomSnapshot;

  constructor(scene: THREE.Scene) {
    const sole = new THREE.Shape();
    sole.moveTo(-.065,-.14); sole.lineTo(.065,-.14); sole.lineTo(.075,.055);
    sole.lineTo(.04,.14); sole.lineTo(-.045,.14); sole.lineTo(-.08,.05); sole.closePath();
    const soleGeometry = new THREE.ShapeGeometry(sole); soleGeometry.rotateX(-Math.PI/2); soleGeometry.rotateY(Math.PI);
    const patch = new THREE.Shape();
    for(let i=0;i<14;i++) { const angle=i*Math.PI*2/14, radius=i%2?.34:.42; const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius; if(i===0)patch.moveTo(x,z);else patch.lineTo(x,z); } patch.closePath();
    const patchGeometry = new THREE.ShapeGeometry(patch); patchGeometry.rotateX(-Math.PI/2);
    this.footprints = this.create(soleGeometry, MAX_FOOTPRINTS, 0x69462c);
    this.marks = this.create(patchGeometry, 4, 0x886545);
    scene.add(this.footprints, this.marks);
  }

  private create(geometry: THREE.BufferGeometry, capacity: number, color: number) {
    geometry.setAttribute('detailFade', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
    const pitch=Math.atan2(BEAM.height-BEAM.targetY,BEAM.targetDistance);
    const uniforms={ beams:{value:this.beams}, beamCount:{value:0},
      pitch:{value:new THREE.Vector2(Math.cos(pitch),Math.sin(pitch))},
      cone:{value:new THREE.Vector2(Math.cos(BEAM.halfAngle),Math.cos(BEAM.halfAngle*(1-BEAM.penumbra)))} };
    const material=new THREE.MeshStandardMaterial({color,transparent:true,depthWrite:false,side:THREE.DoubleSide,roughness:1});
    material.customProgramCacheKey=()=>"beam-trace-shadow-v1";
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader="attribute float detailFade; varying vec3 traceWorldPoint; varying float traceFade;\n"+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace("#include <project_vertex>",`#include <project_vertex>
        traceWorldPoint=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz; traceFade=detailFade;`);
      shader.fragmentShader=`uniform vec4 beams[6]; uniform int beamCount; uniform vec2 pitch; uniform vec2 cone;
        varying vec3 traceWorldPoint; varying float traceFade;\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace("#include <lights_fragment_begin>",
        "float traceSpotIllumination=0.0;\n"+THREE.ShaderChunk.lights_fragment_begin.replace(
          /(getShadow\( spotShadowMap[^;]+;\s*#endif\s*)(RE_Direct\()/,
          "$1traceSpotIllumination += max(directLight.color.r,max(directLight.color.g,directLight.color.b));\n$2"
        ));
      shader.fragmentShader=shader.fragmentShader.replace("#include <opaque_fragment>",`
        float traceStrength=0.0; for(int i=0;i<6;i++){if(i>=beamCount)break;
          vec2 facing=vec2(sin(beams[i].z),cos(beams[i].z));
          vec3 delta=traceWorldPoint-vec3(beams[i].x+facing.x*${BEAM.forwardOffset},${BEAM.height},beams[i].y+facing.y*${BEAM.forwardOffset});
          float distance=length(delta); if(distance>=${BEAM.range}.0)continue;
          float cosine=dot(delta,vec3(facing.x*pitch.x,-pitch.y,facing.y*pitch.x))/max(distance,.0001);
          traceStrength=max(traceStrength,smoothstep(cone.x,cone.y,cosine)); }
        if(traceStrength<=.001 || traceFade<=.001 || traceSpotIllumination<=.00001)discard;
        outgoingLight=diffuseColor.rgb*mix(.7,1.1,traceStrength)*min(1.0,traceSpotIllumination*10.0);
        diffuseColor.a=traceFade*traceStrength*.92;
        #include <opaque_fragment>`);
    };
    this.materialUniforms.push(uniforms);
    const mesh=new THREE.InstancedMesh(geometry,material,capacity); mesh.count=0; mesh.frustumCulled=false; mesh.renderOrder=2; mesh.receiveShadow=true;
    return mesh;
  }

  update(snapshot: RoomSnapshot) { this.snapshot=snapshot; }

  frame(serverNow: number) {
    const snapshot=this.snapshot, round=snapshot?.round;
    const active=round?.phase==='hiding'||round?.phase==='seeking';
    const seekers=(snapshot?.players??[]).filter(player=>player.role==='seeker'&&player.place==='street'&&player.flashlight);
    seekers.slice(0,6).forEach((player,i)=>this.beams[i].set(player.x,player.z,player.facing,0));
    this.materialUniforms.forEach(uniforms=>uniforms.beamCount.value=seekers.length);
    const footprints=active?round?.footprints??[]:[], marks=active?round?.marks??[]:[];
    this.footprints.count=Math.min(footprints.length,MAX_FOOTPRINTS); this.marks.count=Math.min(marks.length,4);
    let visibleFootprints=0,visibleMarks=0;
    const put=(mesh:THREE.InstancedMesh,index:number,point:{x:number;z:number},facing:number,fade:number)=>{
      const y=groundHeight(point.x,point.z)+.008;
      this.position.set(point.x,y,point.z); this.rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,facing);
      this.matrix.compose(this.position,this.rotation,this.scale); mesh.setMatrixAt(index,this.matrix);
      (mesh.geometry.attributes.detailFade as THREE.InstancedBufferAttribute).setX(index,fade);
      return fade>0&&seekers.some(player=>groundBeamStrength(point,player,y)>.001);
    };
    footprints.slice(0,MAX_FOOTPRINTS).forEach((foot,index)=>{
      const fade=foot.fadeAt?Math.max(0,Math.min(1,(foot.expiresAt-serverNow)/Math.max(1,foot.expiresAt-foot.fadeAt))):1;
      const side=parseInt(foot.id.replace(/-/g,"" ).slice(-1),16)%2?.13:-.13;
      const point={x:foot.x+Math.cos(foot.facing)*side,z:foot.z-Math.sin(foot.facing)*side};
      if(put(this.footprints,index,point,foot.facing,fade))visibleFootprints++;
    });
    marks.slice(0,4).forEach((mark,index)=>{if(put(this.marks,index,mark,0,1))visibleMarks++;});
    for(const mesh of [this.footprints,this.marks]) { mesh.instanceMatrix.needsUpdate=true; (mesh.geometry.attributes.detailFade as THREE.InstancedBufferAttribute).needsUpdate=true; }
    return { footprintsReceived:footprints.length, marksReceived:marks.length, footprintsVisible:visibleFootprints, marksVisible:visibleMarks };
  }
}
