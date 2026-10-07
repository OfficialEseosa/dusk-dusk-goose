import type {Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
/** Capture the current compositor frame without Playwright's screenshot preparation waits. */
export async function captureFrame(page:Page,path:string){
  const session=await page.context().newCDPSession(page);try{const frame=await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true,optimizeForSpeed:true});await writeFile(path,Buffer.from(frame.data,'base64'));}finally{await session.detach();}
}
