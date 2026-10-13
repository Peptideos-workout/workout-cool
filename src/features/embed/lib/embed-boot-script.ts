import { EMBED_SESSION_KEY } from "./embed-mode";

/**
 * Blocking head script. It turns on the tab-scoped embed flag before first paint,
 * applies a light or dark theme before next-themes hydrates, and retargets
 * navigations that would otherwise leave the frame.
 * The embed flag stays in sessionStorage. Embed theme is stored at `wc-embed-theme`.
 * While embed is on, next-themes' default `theme` key is redirected there so a framed
 * visit cannot overwrite the theme used by a normal tab. Storage events for that
 * default key are ignored, so a normal tab cannot change the embed theme.
 * The embed theme comes from `?theme=` and later `wc:theme` messages.
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
