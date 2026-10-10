export type NovelExportNotice={kind:"success"|"error"|"info";title:string;message:string;path?:string;key?:string};
export type NovelAudioDownload={id:string;state:"started"|"completed"|"cancelled"|"interrupted";filename:string;path?:string};
export function notifyNovelExport(notice:NovelExportNotice){window.dispatchEvent(new CustomEvent("rm:novel-export-notice",{detail:notice}));}
