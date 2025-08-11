const t=r=>{if(!r)return"정보 없음";let e=r.replace(/^\+82\s*/,"0");return e.length===11&&!e.includes("-")&&(e=`${e.slice(0,3)}-${e.slice(3,7)}-${e.slice(7)}`),e};export{t as f};
