const fs=require('fs');const JO=require('javascript-obfuscator');
let s=fs.readFileSync('../www/index.html','utf8');
const patch=fs.readFileSync('demo-patch.js','utf8');
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
fs.mkdirSync('site/fonts',{recursive:true});
fs.writeFileSync('site/game.html',s);
console.error('out',s.length);
