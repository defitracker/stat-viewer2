import{e as m,d as b,f,j as r,S as x,g as u,h as j,i as p,k as h,B as S,l as g,m as o,L as y,n as N,o as L}from"./index-DlN7TR9l.js";const c=e=>Symbol.iterator in e,l=e=>"entries"in e,d=(e,t)=>{const i=e instanceof Map?e:new Map(e.entries()),a=t instanceof Map?t:new Map(t.entries());if(i.size!==a.size)return!1;for(const[n,s]of i)if(!Object.is(s,a.get(n)))return!1;return!0},O=(e,t)=>{const i=e[Symbol.iterator](),a=t[Symbol.iterator]();let n=i.next(),s=a.next();for(;!n.done&&!s.done;){if(!Object.is(n.value,s.value))return!1;n=i.next(),s=a.next()}return!!n.done&&!!s.done};function k(e,t){return Object.is(e,t)?!0:typeof e!="object"||e===null||typeof t!="object"||t===null?!1:!c(e)||!c(t)?d({entries:()=>Object.entries(e)},{entries:()=>Object.entries(t)}):l(e)&&l(t)?d(e,t):O(e,t)}function M(e){const t=m.useRef();return i=>{const a=e(i);return k(t.current,a)?t.current:t.current=a}}function _({children:e}){const{tables:t,filename:i}=b(M(s=>({filename:s.filename,tables:s.tables}))),n=f().pathname.split("/")[2];return r.jsxs(x,{children:[r.jsx(u,{sublocation:"sqlite",navMain:[{title:"Tables",url:"#",items:t.map(s=>({title:s,url:`/sqlite/${s}`,isActive:s===n}))}]}),r.jsxs(j,{children:[r.jsxs("header",{className:"flex h-16 shrink-0 items-center gap-2 border-b px-4",children:[r.jsx(p,{className:"-ml-1"}),r.jsx(h,{orientation:"vertical",className:"mr-2 h-4"}),r.jsx(S,{children:r.jsxs(g,{children:[r.jsx(o,{className:"hidden md:block",children:r.jsx(y,{className:"transition-colors hover:text-foreground",to:"/sqlite",children:"SQLite"})}),n&&r.jsxs(r.Fragment,{children:[r.jsx(N,{className:"hidden md:block"}),r.jsx(o,{children:r.jsx(L,{children:`${n}'s table`})})]})]})}),r.jsx("div",{className:"ml-auto",children:i})]}),r.jsx("div",{className:"flex flex-1 flex-col gap-4 p-4",children:e})]})]})}const I=Object.freeze(Object.defineProperty({__proto__:null,default:_},Symbol.toStringTag,{value:"Module"}));export{_ as S,I as _,M as u};
//# sourceMappingURL=_layout-BR--WYu4.js.map
