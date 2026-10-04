import {expect,type Page} from '@playwright/test';

export async function localPose(page:Page){
  return page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.playerposes??'{}')[c.dataset.localId!]);
}
export async function walkAxis(page:Page,axis:'x'|'z',target:number){
  const before=await localPose(page),direction=Math.sign(target-before[axis]);
  if(Math.abs(target-before[axis])<.08)return;
  const key=axis==='x'?(direction>0?'d':'a'):(direction>0?'s':'w');
  await page.keyboard.down(key);
  try{await page.waitForFunction(({axis,target,direction})=>{
    const c=document.querySelector('canvas')!;
    const p=JSON.parse(c.dataset.playerposes??'{}')[c.dataset.localId!];
    return p&&(p[axis]-target)*direction>=-.06;
  },{axis,target,direction},{timeout:12000});}
  finally{await page.keyboard.up(key);}
}
/** Use the actual preparation-room movement and contextual action. */
export async function pickUpFlashlight(page:Page){
  await expect(page.locator('canvas')).toHaveAttribute('data-location','prep');
  await walkAxis(page,'x',0);await walkAxis(page,'z',-1.1);
  await expect(page.locator('#round-action')).toContainText('Pick up');
  await page.locator('#round-action').click();
}
export async function seeking(page:Page){
  await expect(page.locator('canvas')).toHaveAttribute('data-round-phase','seeking',{timeout:45000});
  await expect(page.locator('canvas')).toHaveAttribute('data-location','street');
  // Location changes in the snapshot handler; pose observations publish on the
  // next render sample. Do not mistake the old preparation x=0 for street x=0.
  await page.waitForFunction(()=>{const c=document.querySelector('canvas')!;
    const pose=JSON.parse(c.dataset.playerposes??'{}')[c.dataset.localId!];
    return c.dataset.role==='hider'||pose&&Math.abs(pose.z-2)<.1;
  });
}
