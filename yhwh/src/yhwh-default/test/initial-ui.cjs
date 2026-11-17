const { _electron:electron }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
(async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yhwh-initial-ui-'));
  for(const variant of ['default','three']) {
    const cwd=path.join(temp,variant),config=path.join(temp,variant+'-config');await fs.mkdir(cwd);await fs.mkdir(config);
    const env={...process.env,YHWH_CONFIG_HOME:config,YHWH_SYSTEM_CONFIG:path.join(temp,'system'),YHWH_DATA_DIR:path.join(temp,'profile-'+variant),YHWH_THREE_DATA_DIR:path.join(temp,'profile-three'),YHWH_NO_SHELL_RC:'1',YHWH_NODE:process.execPath,YHWH_SHELL:require('node:child_process').execFileSync('which',['bash'],{encoding:'utf8'}).trim()};delete env.ELECTRON_RUN_AS_NODE;
    const app=await electron.launch({executablePath:require('../../../lib/electron.cjs')(),args:[path.resolve(__dirname,variant==='three'?'../../yhwh-three':'..'),'--disable-gpu','--cwd',cwd],env,timeout:60000});
    try{
      const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.waitForFunction(()=>window.YHWH?.initial);
      await page.locator('#initial-commands').click();await page.waitForSelector('#initial-dialog[open] .initial-shelf');
      assert.ok(await page.locator('.initial-tile').count()>=6);
      await page.locator('#initial-dialog [data-close]').click();
      await page.evaluate(()=>window.YHWH.initial.run("mkdir check; echo 'Abe' > check/note.md; ls check | view"));
      await page.waitForSelector('.document-content:not([hidden]) .initial-file-view');
      assert.match(await page.locator('.document-content:not([hidden]) .initial-file-grid').textContent(),/note.md/);
      assert.equal(await fs.readFile(path.join(cwd,'check/note.md'),'utf8'),'Abe');
      const tabs=await page.evaluate(()=>window.YHWH.tabs.length);
      await page.evaluate(()=>window.YHWH.initial.run('fm .'));
      assert.equal(await page.evaluate(()=>window.YHWH.tabs.length),tabs+1);
      await page.evaluate(()=>window.YHWH.initial.run('touch newly-created.txt'));
      await page.waitForFunction(()=>document.querySelector('.document-content:not([hidden]) .initial-file-grid')?.textContent.includes('newly-created.txt'));
      assert.deepEqual(errors,[]);console.log(`Passed ${variant}: Initial shelf, typed pipeline, versioned file write, snapshot and live file manager.`);
    }finally{await app.close();}
  }
  await fs.rm(temp,{recursive:true,force:true});
})().catch(error=>{console.error(error);process.exitCode=1;});
