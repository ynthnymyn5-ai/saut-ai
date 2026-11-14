const fs=require('fs');const JO=require('javascript-obfuscator');
let s=fs.readFileSync('../www/index.html','utf8');
// DEMO_UNTIL=YYYY-MM-DD (last day the demo works, Kuwait time), OUT=output file (default site/game.html)
const day=process.env.DEMO_UNTIL||new Date(Date.now()+7*864e5).toISOString().slice(0,10);
const [y,mo,d]=day.split('-').map(Number);
const until=new Date(Date.UTC(y,mo-1,d+1)-3*3600e3).toISOString();   // midnight after that day, UTC+3
const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const patch=fs.readFileSync('demo-patch.js','utf8').replace('__UNTIL__',until).replace('__UNTIL_LABEL__',d+' '+MONTHS[mo-1]);
console.error('demo works until end of',day,'('+until+')');
s=s.replace('</body>','<script>'+patch+'</script>\n</body>');
let n=0;
s=s.replace(/<script(?![^>]*src)([^>]*)>([\s\S]*?)<\/script>/g,(m,attr,code)=>{
  const t0=Date.now();
  const r=JO.obfuscate(code,{compact:true,renameGlobals:false,identifierNamesGenerator:'hexadecimal',
    stringArray:true,stringArrayThreshold:0.6,stringArrayEncoding:[],splitStrings:false,
    controlFlowFlattening:false,deadCodeInjection:false,selfDefending:false,debugProtection:false,
    transformObjectKeys:false,unicodeEscapeSequence:false,target:'browser',seed:7});
  n++;console.error('script',n,code.length,'->',r.getObfuscatedCode().length,(Date.now()-t0)+'ms');
  return '<script'+attr+'>'+r.getObfuscatedCode()+'</script>';
});
// strip HTML comments
s=s.replace(/<!--[\s\S]*?-->/g,'');
const out=process.env.OUT||'site/game.html';
fs.mkdirSync(require('path').dirname(out),{recursive:true});
fs.writeFileSync(out,s);
console.error('out',s.length);
