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
  const help=page.getByRole('dialog',{name:'사용 방법'});await expect(help).toBeVisible();await help.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByRole('button',{name:'빈 프로젝트로 시작',exact:true}).click();await expect(page).toHaveURL(/\/project\/.+\/outline/);
  const projectId=page.url().match(/\/project\/([^/]+)/)![1];
  try{
    await page.getByRole('button',{name:'페이지 추가',exact:true}).click();
    await expect.poll(async()=>(await(await request.get(`/api/projects/${projectId}`)).json()).data.pages.length).toBe(1);
    const project=(await(await request.get(`/api/projects/${projectId}`)).json()).data;const pageId=project.pages[0].page_id;
    await request.put(`/api/projects/${projectId}/pages/${pageId}/outline`,{data:{outline_content:{title:'로컬 편집 검증',points:['영역 편집','PPTX 다운로드']}}});
    await request.put(`/api/projects/${projectId}/pages/${pageId}/description`,{data:{description_content:{text:'테스트 슬라이드입니다.'}}});
    execFileSync(python,[path.join(root,'scripts/seed_local_e2e.py'),projectId,pageId]);await page.goto(`/project/${projectId}/preview`);
    await expect(page.getByText('로컬 편집 검증').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/[\u4e00-\u9fff]/);await page.screenshot({path:testInfo.outputPath('preview.png')});
    await page.getByTestId('preview-floating-toolbar').getByRole('button',{name:'편집',exact:true}).click();
    await expect(page.getByRole('button',{name:'영역 선택 종료',exact:true}).first()).toBeVisible();
    let target;for(const img of await page.locator('main img:visible').all()){const box=await img.boundingBox();if(box&&box.width>500){target=box;break;}}
    expect(target).toBeTruthy();await page.mouse.move(target!.x+120,target!.y+90);await page.mouse.down();await page.mouse.move(target!.x+360,target!.y+200,{steps:10});await page.mouse.up();
    await expect(page.getByTestId('inline-edit-attachment-thumb')).toHaveCount(1);
    await page.getByTestId('inline-edit-prompt').fill('선택한 영역의 제목을 파란색으로 바꿔 주세요.');
    // Only the paid AI call is stubbed; all storage and export requests are real.
    let payload='';await page.route(`**/api/projects/${projectId}/pages/${pageId}/edit/image`,async route=>{payload=route.request().postData()||'';await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({success:false,error:{code:'TEST_NO_MODEL',message:'테스트에서는 유료 모델을 호출하지 않습니다.'}})});});
    await page.getByTestId('inline-edit-prompt').press('Control+Enter');await expect.poll(()=>payload).toContain('선택한 영역의 제목');expect(payload).toContain('context_images');
    await expect(page.getByText('테스트에서는 유료 모델을 호출하지 않습니다.',{exact:true})).toBeVisible();
    await expect(page.getByTestId('inline-edit-prompt')).toHaveValue('선택한 영역의 제목을 파란색으로 바꿔 주세요.');
    await expect(page.getByTestId('inline-edit-attachment-thumb')).toHaveCount(1);
    await page.reload();await page.getByRole('button',{name:'내보내기',exact:true}).click();await page.getByRole('button',{name:'PPTX 내보내기',exact:true}).click();
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'내보내기 시작',exact:true}).click();const download=await downloadPromise;
    const saved=testInfo.outputPath('browser-export.pptx');await download.saveAs(saved);
    const result=execFileSync(python,['-c','from pptx import Presentation; import sys; p=Presentation(sys.argv[1]); assert len(p.slides)==1; assert len(p.slides[0].shapes)>0; print("PPTX verified")',saved],{encoding:'utf8'});
    expect(result).toContain('PPTX verified');expect(errors).toEqual([]);
  }finally{await request.delete(`/api/projects/${projectId}`);}
});

test('Sol.A design defaults and Azure-only settings',async({page,request})=>{
  const previous=(await(await request.get('/api/settings')).json()).data.design_system_prompt || '';
  const prompt='Sol.A E2E: 흰색 배경, 금색 강조, 넓은 여백';
  let projectId='';
  try {
    await page.goto('/settings');
    await expect(page.getByText('사내 Azure Foundry OpenAI 전용',{exact:false})).toBeVisible();
    await expect(page.getByText('Gemini',{exact:true})).toHaveCount(0);
    await page.getByLabel('디자인 시스템 프롬프트').fill(prompt);
    await page.getByRole('button',{name:'설정 저장',exact:true}).click();
    await expect(page.getByText('설정을 저장했습니다.',{exact:true})).toBeVisible();
    await page.reload();await expect(page.getByLabel('디자인 시스템 프롬프트')).toHaveValue(prompt);
    const created=await request.post('/api/projects',{data:{creation_type:'blank'}});
    projectId=(await created.json()).data.project_id;
    const project=(await(await request.get(`/api/projects/${projectId}`)).json()).data;
    expect(project.template_style).toBe(prompt);
    await page.goto('/');await expect(page).toHaveTitle(/Sol.A/);
    await expect(page.locator('img[src*="sola-sun"]').first()).toBeVisible();
  } finally {
    await request.put('/api/settings',{data:{design_system_prompt:previous}});
    if(projectId) await request.delete(`/api/projects/${projectId}`);
  }
});

test('edited script is saved before Azure TTS video export and MP4 download',async({page,request},testInfo)=>{
  test.skip(process.env.SOLA_E2E_VIDEO!=='1','Requires the local Azure speech protocol fixture');
  const created=(await(await request.post('/api/projects',{data:{creation_type:'blank'}})).json()).data;
  const projectId=created.project_id;
  try {
    const added=await request.post(`/api/projects/${projectId}/pages`,{data:{order_index:0,outline_content:{title:'Sol.A 발표 테스트'}}});
    const pageId=(await added.json()).data.page_id;
    await request.put(`/api/projects/${projectId}/pages/${pageId}/description`,{data:{description_content:{text:'화면에 보여줄 내용',extra_fields:{TTS_SCRIPT:'처음 생성한 발표 스크립트'}}}});
    execFileSync(python,[path.join(root,'scripts/seed_local_e2e.py'),projectId,pageId]);
    await page.goto(`/project/${projectId}/preview`);
    const script=page.getByTestId('drawer-narration-input');
    await expect(script).toHaveValue('처음 생성한 발표 스크립트');
    const edited='마지막으로 수정한 Sol.A 발표 스크립트입니다.';
    await script.fill(edited);
    // Click immediately: the export must wait for the debounced save.
    await page.getByRole('button',{name:'내보내기',exact:true}).click();
    await page.getByRole('button',{name:'TTS로 발표 미디어 생성하기',exact:true}).click();
    const submitted=page.waitForResponse(r=>r.url().endsWith(`/api/projects/${projectId}/export/video`)&&r.request().method()==='POST');
    await page.getByRole('button',{name:'발표 동영상 생성',exact:true}).click();
    const response=await submitted;expect(response.status()).toBe(202);
    const taskId=(await response.json()).data.task_id;
    await expect.poll(async()=>{
      const result=(await(await request.get(`/api/projects/${projectId}/tasks/${taskId}`)).json()).data;
      if(result.status==='FAILED') throw new Error(JSON.stringify(result));
      return result.status;
    },{timeout:45000}).toBe('COMPLETED');
    const saved=(await(await request.get(`/api/projects/${projectId}`)).json()).data.pages[0];
    expect(saved.narration_text).toBe(edited);
    const inputs=execFileSync(python,['-c','from pathlib import Path; import os; print((Path(os.environ["SOLA_E2E_FOLDER"])/"speech-inputs.jsonl").read_text())'],{encoding:'utf8'});
    expect(inputs).toContain(edited);
    const downloadPromise=page.waitForEvent('download');
    await page.getByTestId('export-tasks-list').getByRole('button',{name:'다운로드',exact:true}).first().click();
    const download=await downloadPromise;const file=testInfo.outputPath('sola-presentation.mp4');await download.saveAs(file);
    const media=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
    expect(media.streams.map((stream:any)=>stream.codec_type).sort()).toEqual(['audio','video']);
    await page.screenshot({path:testInfo.outputPath('sola-video-export.png')});
  } finally { await request.delete(`/api/projects/${projectId}`); }
});
