import fs from "node:fs";

export function pcmWave(data:Buffer){
  if(data.length<12||data.toString("ascii",0,4)!=="RIFF"||data.toString("ascii",8,12)!=="WAVE")throw new Error("语音缓存不是 WAV");
  let format:Buffer|undefined,pcm:Buffer|undefined;
  for(let offset=12;offset+8<=data.length;){
    const size=data.readUInt32LE(offset+4),end=offset+8+size;
    if(end>data.length)throw new Error("WAV 缓存不完整");
    const id=data.toString("ascii",offset,offset+4);
    if(id==="fmt ")format=data.subarray(offset+8,end);
    if(id==="data")pcm=data.subarray(offset+8,end);
    offset=end+(size%2);
  }
  if(!format||format.length<16||format.readUInt16LE(0)!==1||!pcm||!format.readUInt16LE(12)||pcm.length%format.readUInt16LE(12))throw new Error("仅支持完整 PCM WAV 音频");
  return {format:format.subarray(0,16),pcm};
}

export class WavWriter {
  private fd:number;
  private format:Buffer|null=null;
  private size=0;
  constructor(readonly file:string){this.fd=fs.openSync(file,"wx");fs.writeSync(this.fd,Buffer.alloc(44));}
  append(file:string){
    const {format,pcm}=pcmWave(fs.readFileSync(file));
    if(this.format&&!this.format.equals(format))throw new Error("语音采样格式不一致");
    if(this.size+pcm.length>512*1024*1024)throw new Error("单章音频超过 512 MB，请减少导出内容");
    this.format=format;fs.writeSync(this.fd,pcm);this.size+=pcm.length;
  }
  finish(){
    if(!this.format||!this.size)throw new Error("此章没有可导出的朗读内容");
    const header=Buffer.alloc(44);header.write("RIFF",0);header.writeUInt32LE(this.size+36,4);header.write("WAVEfmt ",8);header.writeUInt32LE(16,16);this.format.copy(header,20);header.write("data",36);header.writeUInt32LE(this.size,40);fs.writeSync(this.fd,header,0,44,0);
    this.close();return this.size+44;
  }
  close(){if(this.fd>=0){fs.closeSync(this.fd);this.fd=-1;}}
}
