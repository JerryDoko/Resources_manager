const path = require("path");
const { execFileSync } = require("child_process");
const fs = require("fs");

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const python=path.join(appPath,"Contents/Resources/kokoro/bundle/darwin-arm64/python");
  function signRuntime(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())signRuntime(file);
      else if(entry.isFile()&&(/\.(so|dylib)$/.test(file)||/^python3\.\d+$/.test(entry.name)))execFileSync("codesign",["--force","--sign","-",file],{stdio:"pipe"});
    }
  }
  if(fs.existsSync(python))signRuntime(python);
  execFileSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", appPath],
    { stdio: "inherit" }
  );
  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    { stdio: "inherit" }
  );
  console.log(`[afterSign] ad-hoc 重签名并校验通过 → ${appPath}`);
};
