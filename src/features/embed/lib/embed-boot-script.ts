import { EMBED_SESSION_KEY } from "./embed-mode";

/**
 * Blocking head script. It turns on the tab-scoped embed flag before first paint
 * and retargets navigations that would otherwise leave the frame.
 * Theme persistence is added by the postMessage bridge; this script does not
 * touch localStorage.
 */
export function embedBootScript(peptideOrigin = "https://peptideos.us"): string {
  const parentOrigin = JSON.stringify(new URL(peptideOrigin).origin);
  return `(function(){
var KEY=${JSON.stringify(EMBED_SESSION_KEY)};
var root=document.documentElement;
var params;
try{params=new URLSearchParams(location.search);}catch(e){params=new URLSearchParams();}
var enable=false;
try{
if(params.get("embed")==="1"){sessionStorage.setItem(KEY,"1");}
enable=sessionStorage.getItem(KEY)==="1";
}catch(e){enable=params.get("embed")==="1";}
if(enable){root.setAttribute("data-wc-embed","1");}
function embedOn(){return root.getAttribute("data-wc-embed")==="1";}
function stripLocale(pathname){
var path=String(pathname||"").split("?")[0].split("#")[0];
if(path.length>1&&path.charAt(path.length-1)==="/"){path=path.slice(0,-1);}
var stripped=path.replace(/^\\/[a-z]{2}(?:-[a-z]{2})?(?=\\/|$)/i,"");
if(!stripped||stripped==="/"){return "/";}
return stripped.charAt(0)==="/"?stripped:"/"+stripped;
}
function hasPrefix(pathname,prefixes){
var path=stripLocale(pathname);
for(var i=0;i<prefixes.length;i++){
if(path===prefixes[i]||path.indexOf(prefixes[i]+"/")===0){return true;}
}
return false;
}
function frameTarget(href){
var raw=String(href||"").trim();
if(!raw||raw.charAt(0)==="#"||/^javascript:/i.test(raw)||/^data:/i.test(raw)){return null;}
var url;
try{url=new URL(raw,location.origin);}catch(e){return "_blank";}
var signOut=url.origin===location.origin||url.origin===${parentOrigin};
if(signOut&&hasPrefix(url.pathname,["/auth/signout","/api/workouts/signout"])){return "_top";}
if(url.origin===${parentOrigin}&&hasPrefix(url.pathname,["/login","/signup","/api/workouts/sso","/dashboard"])){return "_top";}
var host=url.hostname.toLowerCase();
var payment=host==="stripe.com"||host.endsWith(".stripe.com");
payment=payment||host==="paypal.com"||host.endsWith(".paypal.com");
payment=payment||host==="lemonsqueezy.com"||host.endsWith(".lemonsqueezy.com");
if(payment&&url.protocol==="https:"){return "_top";}
if(url.origin===location.origin){return null;}
return "_blank";
}
document.addEventListener("click",function(event){
if(!embedOn()||!event.target||!event.target.closest){return;}
var anchor=event.target.closest("a[href]");
if(!anchor){return;}
var href=anchor.getAttribute("href")||"";
var target=frameTarget(href);
if(!target){return;}
anchor.setAttribute("target",target);
if(target==="_blank"){
var rel=anchor.getAttribute("rel")||"";
if(rel.indexOf("noopener")===-1){anchor.setAttribute("rel",(rel+" noopener noreferrer").trim());}
}
},true);
document.addEventListener("submit",function(event){
if(!embedOn()||!event.target||!event.target.getAttribute){return;}
var action=event.target.getAttribute("action")||"";
var target=frameTarget(action);
if(target){event.target.setAttribute("target",target);}
},true);
})();`;
}
