import{j as s,L as d,N as l,r as c,O as x}from"./index-BMz7zIRN.js";import{c as o}from"./createLucideIcon-Df3tO_ja.js";import{Z as h}from"./zap-DEj6HJgU.js";import{S as m}from"./shopping-cart-DDLkxA9X.js";import{U as j}from"./users-L5EP99wQ.js";import{P as p}from"./package-CR9FldPL.js";import{S as u}from"./sliders-horizontal-DyKEv-NS.js";import{I as k}from"./image-DRRVApaV.js";import{I as y}from"./SodomallLoader-CN_E-RXV.js";/**
 * @license lucide-react v0.525.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=[["rect",{width:"8",height:"4",x:"8",y:"2",rx:"1",ry:"1",key:"tgr4d6"}],["path",{d:"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",key:"116196"}],["path",{d:"M12 11h4",key:"1jrz19"}],["path",{d:"M12 16h4",key:"n85exb"}],["path",{d:"M8 11h.01",key:"1dfujw"}],["path",{d:"M8 16h.01",key:"18s6g9"}]],M=o("clipboard-list",g);/**
 * @license lucide-react v0.525.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],f=o("external-link",N);/**
 * @license lucide-react v0.525.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"1d0kgt"}]],z=o("house",v);/**
 * @license lucide-react v0.525.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=[["path",{d:"M4 12h16",key:"1lakjw"}],["path",{d:"M4 18h16",key:"19g7jn"}],["path",{d:"M4 6h16",key:"1o0s65"}]],w=o("menu",_);/**
 * @license lucide-react v0.525.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M8 12h8",key:"1wcyev"}],["path",{d:"M12 8v8",key:"napkw2"}]],b=o("square-plus",L),a=({to:t,icon:e,text:i,isSidebarOpen:n,end:r=!1})=>s.jsx("li",{className:"menu-item",children:s.jsxs(l,{to:t,title:n?void 0:i,end:r,children:[e,n&&s.jsx("span",{children:i})]})}),q=({isSidebarOpen:t,toggleSidebar:e})=>s.jsxs("aside",{className:`admin-sidebar ${t?"":"collapsed"}`,children:[s.jsxs("div",{className:"sidebar-header",children:[s.jsx("button",{className:"sidebar-toggle-btn",onClick:e,"aria-label":t?"메뉴 닫기":"메뉴 펼치기",title:t?"메뉴 닫기":"메뉴 펼치기",children:s.jsx(w,{size:24})}),t&&s.jsx("h1",{className:"sidebar-title",children:"관리자페이지"})]}),s.jsx("nav",{className:"sidebar-nav",children:s.jsxs("ul",{children:[s.jsx(a,{to:"/admin/dashboard",icon:s.jsx(z,{size:18}),text:"대시보드",isSidebarOpen:t,end:!0}),s.jsx(a,{to:"/admin/quick-check",icon:s.jsx(h,{size:18}),text:"빠른 예약확인",isSidebarOpen:t}),s.jsx(a,{to:"/admin/orders",icon:s.jsx(m,{size:18}),text:"주문 통합 관리",isSidebarOpen:t}),s.jsx(a,{to:"/admin/users",icon:s.jsx(j,{size:18}),text:"고객 관리",isSidebarOpen:t}),s.jsx(a,{to:"/admin/products",icon:s.jsx(p,{size:18}),text:"상품 목록",isSidebarOpen:t,end:!0}),s.jsx(a,{to:"/admin/products/add",icon:s.jsx(b,{size:18}),text:"새 상품 등록",isSidebarOpen:t}),s.jsx(a,{to:"/admin/products/batch-category",icon:s.jsx(u,{size:18}),text:"카테고리 일괄 변경",isSidebarOpen:t}),s.jsx(a,{to:"/admin/categories",icon:s.jsx(M,{size:18}),text:"카테고리 관리",isSidebarOpen:t}),s.jsx(a,{to:"/admin/banners",icon:s.jsx(k,{size:18}),text:"배너 관리",isSidebarOpen:t})]})}),s.jsx("div",{className:"sidebar-footer",children:s.jsxs(d,{to:"/",className:"customer-page-quick-link",title:"고객 페이지로 이동",children:[s.jsx(f,{size:16}),t&&s.jsx("span",{children:"고객 페이지 바로가기"})]})})]}),Z=()=>{const[t,e]=c.useState(!0),i=()=>{e(!t)};return s.jsxs("div",{className:`admin-layout ${t?"":"sidebar-collapsed"}`,children:[s.jsx(q,{isSidebarOpen:t,toggleSidebar:i}),s.jsx("main",{className:"admin-main-content",children:s.jsx(c.Suspense,{fallback:s.jsx(y,{}),children:s.jsx(x,{})})})]})};export{Z as default};
