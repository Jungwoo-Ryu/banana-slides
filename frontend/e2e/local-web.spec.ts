import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('..');
const python=path.join(root,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');

test('Korean settings save and reload without storing secrets',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/settings');await expect(page.getByRole('heading',{name:'모델 연결'})).toBeVisible();
  await page.getByLabel('출력 언어').selectOption('ko');
  await page.getByRole('button',{name:'설정 저장',exact:true}).click();
  await expect(page.getByText('설정을 저장했습니다.',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByLabel('출력 언어')).toHaveValue('ko');
  expect(await page.locator('input[type=password]').count()).toBe(0);expect(errors).toEqual([]);
});

test('local file upload parses without external AI',async({request})=>{
  const response=await request.post('/api/reference-files/upload',{multipart:{file:{name:'참고자료.txt',mimeType:'text/plain',buffer:Buffer.from('한국어 로컬 문서 업로드 검증')}}});
  expect(response.ok()).toBeTruthy();const data=(await response.json()).data;const id=data.id||data.file?.id;expect(id).toBeTruthy();
  await request.post(`/api/reference-files/${id}/parse`);
  await expect.poll(async()=>{const result=await request.get(`/api/reference-files/${id}`);return(await result.json()).data?.file?.parse_status;}).toBe('completed');
  await request.delete(`/api/reference-files/${id}`);
});

test('blank project, region prompt and actual PPTX browser download',async({page,request},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  const help=page.getByRole('dialog');if(await help.isVisible())await help.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByRole('button',{name:'빈 프로젝트로 시작',exact:true}).click();await expect(page).toHaveURL(/\/project\/.+\/outline/);
  const projectId=page.url().match(/\/project\/([^/]+)/)![1];
  try{
    await page.getByRole('button',{name:'페이지 추가',exact:true}).click();
    await expect.poll(async()=>(await(await request.get(`/api/projects/${projectId}`)).json()).data.pages.length).toBe(1);
    const project=(await(await request.get(`/api/projects/${projectId}`)).json()).data;const pageId=project.pages[0].page_id;
    await request.put(`/api/projects/${projectId}/pages/${pageId}/outline`,{data:{outline_content:{title:'로컬 편집 검증',points:['영역 편집','PPTX 다운로드']}}});
    await request.put(`/api/projects/${projectId}/pages/${pageId}/description`,{data:{description_content:{text:'테스트 슬라이드입니다.'}}});
    execFileSync(python,[path.join(root,'scripts/seed_local_e2e.py'),projectId,pageId]);await page.goto(`/project/${projectId}/preview`);
    await expect(page.getByText('로컬 편집 검증').first()).toBeVisible();await page.screenshot({path:testInfo.outputPath('preview.png')});
    await page.getByTestId('preview-floating-toolbar').getByRole('button',{name:'편집',exact:true}).click();
    await expect(page.getByRole('button',{name:'영역 선택 종료',exact:true}).first()).toBeVisible();
    let target;for(const img of await page.locator('main img:visible').all()){const box=await img.boundingBox();if(box&&box.width>500){target=box;break;}}
    expect(target).toBeTruthy();await page.mouse.move(target!.x+120,target!.y+90);await page.mouse.down();await page.mouse.move(target!.x+360,target!.y+200,{steps:10});await page.mouse.up();
    await expect(page.getByTestId('inline-edit-attachment-thumb')).toHaveCount(1);
    await page.getByTestId('inline-edit-prompt').fill('선택한 영역의 제목을 파란색으로 바꿔 주세요.');
    // Only the paid AI call is stubbed; all storage and export requests are real.
    let payload='';await page.route(`**/api/projects/${projectId}/pages/${pageId}/edit/image`,async route=>{payload=route.request().postData()||'';await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({success:false,error:{code:'TEST_NO_MODEL',message:'테스트에서는 유료 모델을 호출하지 않습니다.'}})});});
    await page.getByTestId('inline-edit-prompt').press('Control+Enter');await expect.poll(()=>payload).toContain('선택한 영역의 제목');expect(payload).toContain('context_images');
    await page.reload();await page.getByRole('button',{name:'내보내기',exact:true}).click();await page.getByRole('button',{name:'PPTX 내보내기',exact:true}).click();
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'내보내기 시작',exact:true}).click();const download=await downloadPromise;
    const saved=testInfo.outputPath('browser-export.pptx');await download.saveAs(saved);
    const result=execFileSync(python,['-c','from pptx import Presentation; import sys; p=Presentation(sys.argv[1]); assert len(p.slides)==1; assert len(p.slides[0].shapes)>0; print("PPTX verified")',saved],{encoding:'utf8'});
    expect(result).toContain('PPTX verified');expect(errors).toEqual([]);
  }finally{await request.delete(`/api/projects/${projectId}`);}
});
