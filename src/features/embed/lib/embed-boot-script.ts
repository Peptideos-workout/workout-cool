import { EMBED_FRAMEABLE_LOGOUT_PATH, EMBED_PARENT_ORIGINS, EMBED_SESSION_KEY, isEmbedParentOrigin } from "./embed-mode";

/**
 * Blocking script. It turns on the tab-scoped embed flag before the rest of the
 * body is parsed, applies a light or dark theme before next-themes hydrates, and
 * retargets navigations that would otherwise leave the frame.
 * Embed mode applies only while this document is actually framed
 * (`window.parent !== window`). A top-level `?embed=1` does not set the flag.
 * A duplicated tab clears the flag. A new tab opened with target=_blank, a modifier click,
 * created, then restored on this frame. Embed theme is stored at `wc-embed-theme`.
 * While embed is on, next-themes' default `theme` key is redirected there so a framed
 * visit cannot overwrite the theme used by a normal tab. Storage events for that
 * default key are ignored, so a normal tab cannot change the embed theme.
 * The embed theme comes from `?theme=` and later `wc:theme` messages.
 * Sign-out never targets the top window. A server-action redirect onto
 * /auth/signout* is rewritten to a frameable page, because that route sends
 * frame-ancestors 'none'.
 */
export function embedBootScript(peptideOrigin = "https://peptideos.us"): string {
  const parents = JSON.stringify(bootParentOrigins(peptideOrigin));
  const frameable = JSON.stringify(EMBED_FRAMEABLE_LOGOUT_PATH);
  return `(function(){
var KEY=${JSON.stringify(EMBED_SESSION_KEY)};
var PARENTS=${parents};
var FRAMEABLE=${frameable};
var root=document.documentElement;
var params;
try{params=new URLSearchParams(location.search);}catch(e){params=new URLSearchParams();}
var framed=false;
try{framed=window.parent!==window;}catch(e){framed=false;}
var enable=false;
try{
if(framed&&params.get("embed")==="1"){sessionStorage.setItem(KEY,"1");}
enable=framed&&sessionStorage.getItem(KEY)==="1";
if(!framed){sessionStorage.removeItem(KEY);}
}catch(e){enable=framed&&params.get("embed")==="1";}
try{
if(!framed){document.cookie=KEY+"=; Path=/; Max-Age=0";}
else if(enable){document.cookie=KEY+"=1; Path=/; SameSite=Lax";}
}catch(e){}
if(enable){root.setAttribute("data-wc-embed","1");}
function embedOn(){return root.getAttribute("data-wc-embed")==="1";}
var embedTheme="wc-embed-theme";
var defaultTheme="theme";
function isolateThemeStorage(){
if(!embedOn()||!localStorage.getItem||!localStorage.setItem||!localStorage.removeItem){return;}
try{
var getItem=localStorage.getItem.bind(localStorage);
var setItem=localStorage.setItem.bind(localStorage);
var removeItem=localStorage.removeItem.bind(localStorage);
localStorage.getItem=function(key){return getItem(key===defaultTheme?embedTheme:key);};
localStorage.setItem=function(key,value){setItem(key===defaultTheme?embedTheme:key,value);};
localStorage.removeItem=function(key){removeItem(key===defaultTheme?embedTheme:key);};
}catch(e){}
}
function applyTheme(){
if(!embedOn()){return;}
var requested=params.get("theme");
var theme=requested==="light"||requested==="dark"?requested:"";
try{
if(theme){localStorage.setItem(embedTheme,theme);}
else{
var stored=localStorage.getItem(embedTheme);
if(stored==="light"||stored==="dark"){theme=stored;}
}
}catch(e){}
if(theme!=="light"&&theme!=="dark"){return;}
if(root.classList){
root.classList.remove("light");
root.classList.remove("dark");
root.classList.add(theme);
}
if(root.style){root.style.colorScheme=theme;}
}
function ignoreDefaultThemeStorage(){
if(!embedOn()||typeof window.addEventListener!=="function"){return;}
try{
window.addEventListener("storage",function(event){
if(!event||event.key!==defaultTheme){return;}
if(event.stopImmediatePropagation){event.stopImmediatePropagation();}
},true);
}catch(e){}
}
isolateThemeStorage();
ignoreDefaultThemeStorage();
applyTheme();
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
function blockedSignout(href){
var raw=String(href||"").trim();
if(!raw||raw.charAt(0)==="#"){return "";}
var url;
try{url=new URL(raw,location.origin);}catch(e){return "";}
if(!hasPrefix(url.pathname,["/auth/signout","/api/workouts/signout"])){return "";}
if(url.origin===location.origin){return "frame";}
if(PARENTS.indexOf(url.origin)!==-1){return "parent";}
return "";
}
function frameTarget(href){
var raw=String(href||"").trim();
if(!raw||raw.charAt(0)==="#"||/^javascript:/i.test(raw)||/^data:/i.test(raw)){return null;}
var url;
try{url=new URL(raw,location.origin);}catch(e){return "_blank";}
if(blockedSignout(raw)){return null;}
if(PARENTS.indexOf(url.origin)!==-1&&hasPrefix(url.pathname,["/login","/signup","/api/workouts/sso","/dashboard"])){return "_top";}
var host=url.hostname.toLowerCase();
var payment=host==="stripe.com"||host.endsWith(".stripe.com");
payment=payment||host==="paypal.com"||host.endsWith(".paypal.com");
payment=payment||host==="lemonsqueezy.com"||host.endsWith(".lemonsqueezy.com");
if(payment&&url.protocol==="https:"){return "_top";}
if(url.origin===location.origin){return null;}
return "_blank";
}
function holdSignout(event,href){
var blocked=blockedSignout(href);
if(!blocked){return false;}
if(event.preventDefault){event.preventDefault();}
if(blocked==="frame"&&location.assign){location.assign(FRAMEABLE);}
return true;
}
function clearEmbedState(){
try{sessionStorage.removeItem(KEY);}catch(e){}
try{document.cookie=KEY+"=; Path=/; Max-Age=0";}catch(e){}
}
function restoreEmbedState(){
if(!framed){return;}
try{if(window.parent===window){return;}}catch(e){return;}
try{sessionStorage.setItem(KEY,"1");}catch(e){}
try{document.cookie=KEY+"=1; Path=/; SameSite=Lax";}catch(e){}
if(root.setAttribute){root.setAttribute("data-wc-embed","1");}
}
function opensNewTab(event,anchor){
if(!event){return false;}
if(event.button===1){return true;}
if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey){return true;}
var declared=anchor&&anchor.getAttribute?anchor.getAttribute("target")||"":"";
return declared==="_blank";
}
function handleAnchor(event){
if(!embedOn()||!event||!event.target||!event.target.closest){return;}
var anchor=event.target.closest("a[href]");
if(!anchor){return;}
var href=anchor.getAttribute("href")||"";
if(holdSignout(event,href)){return;}
var target=frameTarget(href);
if(target){
anchor.setAttribute("target",target);
if(target==="_blank"){
var rel=anchor.getAttribute("rel")||"";
if(rel.indexOf("noopener")===-1){anchor.setAttribute("rel",(rel+" noopener noreferrer").trim());}
}
}
if(opensNewTab(event,anchor)){
clearEmbedState();
setTimeout(restoreEmbedState,0);
}
}
document.addEventListener("click",handleAnchor,true);
document.addEventListener("auxclick",handleAnchor,true);
if(typeof window.open==="function"){
var nativeOpen=window.open.bind(window);
window.open=function(){
if(!embedOn()){return nativeOpen.apply(window,arguments);}
clearEmbedState();
try{return nativeOpen.apply(window,arguments);}
finally{restoreEmbedState();}
};
}
document.addEventListener("submit",function(event){
if(!embedOn()||!event.target||!event.target.getAttribute){return;}
var action=event.target.getAttribute("action")||"";
if(holdSignout(event,action)){return;}
var target=frameTarget(action);
if(target){event.target.setAttribute("target",target);}
},true);
if(window.fetch){
var nativeFetch=window.fetch.bind(window);
window.fetch=function(){
return Promise.resolve(nativeFetch.apply(window,arguments)).then(function(response){
if(!embedOn()||!response||!response.headers||!response.headers.get){return response;}
var header=response.headers.get("x-action-redirect")||"";
if(blockedSignout(header.split(";")[0])!=="frame"){return response;}
var headers=new Headers(response.headers);
var semi=header.indexOf(";");
var suffix=semi===-1?"":header.slice(semi);
headers.set("x-action-redirect",FRAMEABLE+suffix);
headers.delete("content-type");
return new Response(null,{status:response.status,statusText:response.statusText,headers:headers});
});
};
}
})();`;
}

function bootParentOrigins(peptideOrigin: string): string[] {
  const parents = new Set<string>(EMBED_PARENT_ORIGINS);
  try {
    const requested = new URL(peptideOrigin).origin;
    if (isEmbedParentOrigin(requested)) parents.add(requested);
  } catch {
    // A bad configured origin never joins the allowlist.
  }
  return [...parents];
}
