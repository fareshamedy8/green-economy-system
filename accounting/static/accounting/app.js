(function(){
  const base = '';

  function el(tag, attrs, ...children){
    const e = document.createElement(tag);
    for(const k in (attrs||{})) e.setAttribute(k, attrs[k]);
    for(const c of children){ if(typeof c === 'string') e.appendChild(document.createTextNode(c)); else e.appendChild(c); }
    return e;
  }

  async function listAccounts(){
    const res = await fetch(base + '/accounts');
    const data = await res.json();
    const container = document.getElementById('accounts-list');
    const table = el('table', {class:'table table-sm table-striped'});
    const thead = el('thead', {}, el('tr', {}, el('th', {}, 'Code'), el('th', {}, 'Name'), el('th', {}, 'Type')));
    const tbody = el('tbody');
    data.forEach(a=>{
      tbody.appendChild(el('tr', {}, el('td', {}, a.code), el('td', {}, a.name), el('td', {}, a.type)));
    });
    table.appendChild(thead); table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
  }

  async function loadTrialBalance(){
    const res = await fetch(base + '/trial-balance');
    const data = await res.json();
    const container = document.getElementById('trial-balance');
    const table = el('table', {class:'table table-sm table-bordered'});
    const thead = el('thead', {}, el('tr', {}, el('th', {}, 'Code'), el('th', {}, 'Name'), el('th', {}, 'Debit'), el('th', {}, 'Credit')));
    const tbody = el('tbody');
    data.forEach(r=>{
      tbody.appendChild(el('tr', {}, el('td', {}, r.code), el('td', {}, r.name), el('td', {}, r.total_debit), el('td', {}, r.total_credit)));
    });
    table.appendChild(thead); table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
  }

  async function postAccount(ev){
    ev.preventDefault();
    const form = ev.target;
    const payload = { code: form.code.value, name: form.name.value, type: form.type.value };
    const res = await fetch(base + '/accounts', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    if(res.status===201){ form.reset(); await listAccounts(); await loadTrialBalance(); } else { alert('Error creating account'); }
  }

  function addEntryRow(){
    const container = document.getElementById('entries');
    const row = document.createElement('div'); row.className = 'entry-row';
    const acc = el('input', {placeholder:'account_id', name:'account_id', class:'form-control'});
    const debit = el('input', {placeholder:'debit', name:'debit', class:'form-control'});
    const credit = el('input', {placeholder:'credit', name:'credit', class:'form-control'});
    const del = el('button', {type:'button', class:'btn btn-danger btn-sm'}, 'x');
    del.addEventListener('click', ()=> row.remove());
    row.appendChild(acc); row.appendChild(debit); row.appendChild(credit); row.appendChild(del);
    container.appendChild(row);
  }

  async function postTransaction(ev){
    ev.preventDefault();
    const form = ev.target;
    const entries = [];
    document.querySelectorAll('#entries .entry-row').forEach(r=>{
      const inputs = r.querySelectorAll('input');
      entries.push({ account_id: inputs[0].value || null, debit: parseFloat(inputs[1].value||0)||0, credit: parseFloat(inputs[2].value||0)||0 });
    });
    const payload = { reference: form.reference.value, date: form.date.value, description: form.description.value, entries };
    const res = await fetch(base + '/transactions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const data = await res.json();
    if(res.status===201){ alert('Transaction posted: ' + data.transaction_id); form.reset(); document.getElementById('entries').innerHTML=''; await listAccounts(); await loadTrialBalance(); } else { alert('Error: ' + (data.error||'unknown')); }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    listAccounts(); loadTrialBalance();
    document.getElementById('account-form').addEventListener('submit', postAccount);
    document.getElementById('tx-form').addEventListener('submit', postTransaction);
    document.getElementById('add-entry').addEventListener('click', addEntryRow);
    // add initial two entries for convenience
    addEntryRow(); addEntryRow();
  });
})();
