/* pos.niveshsahayak.in: quick billing counter. Search or scan an item, take cash or UPI, show the change, print a thermal receipt.
   A bill is saved as a normal invoice record (type 'invoice', counter: 1, kind tax / supply / plain, status 'paid'), so the
   Nivesh Sahayak App counts it as a sale paid on the spot and billing.niveshsahayak.in can open it. Its own number series POS/YY-YY/0001.
   Shelf prices usually include GST, so the counter takes the price with GST and stores the rate without it (as every other tool does). */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t;
  var ITEMS = [], K;
  var TITLE = { tax: 'TAX INVOICE', supply: 'BILL OF SUPPLY', plain: 'CASH MEMO' };
  /* the same bill on A4 or A5 paper, in the design chosen (Classic, Bold, Bill book...) */
  function page(d, o, K) {
    var tax = d.kind === 'tax', b = d.buyer, sg = { '04': 1, '26': 1, '31': 1, '35': 1, '38': 1 }[d.seller.state] ? 'UTGST' : 'SGST';
    var rows = o.rows.length ? o.rows.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td class="l">' + esc(r.it.desc) + '</td>' + (tax ? '<td class="mono">' + esc(r.it.hsn || '') + '</td>' : '') + '<td class="n">' + NS.qty(num(r.it.qty)) + ' ' + esc(r.it.unit) + '</td>' +
        '<td class="n">' + NS.money(tax ? num(r.it.rate) : num(r.it.price || r.it.rate), false) + '</td>' + (tax ? '<td class="n">' + r.g + '%</td>' : '') + '<td class="n">' + NS.money(r.amount, false) + '</td></tr>';
    }).join('') : '<tr><td colspan="' + (tax ? 7 : 5) + '" class="ph">Items you add appear here</td></tr>';
    var rates = tax && Object.keys(o.byRate).length ? '<table class="sum"><caption>GST by rate</caption><thead><tr><th>GST %</th><th class="n">Taxable</th><th class="n">Tax</th></tr></thead><tbody>' +
      Object.keys(o.byRate).sort(function (x, y) { return x - y; }).map(function (g) { var x = o.byRate[g]; return '<tr><td>' + g + '%</td><td class="n">' + NS.money(x.taxable, false) + '</td><td class="n">' + NS.money(x.tax, false) + '</td></tr>'; }).join('') + '</tbody></table>' : '';
    return K.open(d, 'pos') + K.head(d, TITLE[d.kind], '') +
      K.meta([[d.kind === 'plain' ? 'Memo No.' : 'Bill No.', '<span class="mono">' + esc(d.no) + '</span>'], ['Date', NS.fmtDate(d.date) + (d.time ? ' ' + esc(d.time) : '')], ['Paid by', K.mode(d.payMode)],
        d.payMode === 'cash' && num(d.tender) ? ['Cash given', NS.money(num(d.tender))] : null, d.payMode === 'cash' && num(d.tender) ? ['Change', NS.money(Math.max(0, o.change))] : null]) +
      (b.name || b.gstin ? '<div class="parties">' + K.party(b, 'Customer') + '</div>' : '') +
      '<table class="lines"><thead><tr><th>#</th><th class="l">Item</th>' + (tax ? '<th>HSN</th>' : '') + '<th class="n">Qty</th><th class="n">Rate</th>' + (tax ? '<th class="n">GST</th>' : '') + '<th class="n">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="foot"><div class="foot-l">' + K.words(o.total) + rates + (d.kind === 'supply' ? '<p class="small">Composition taxable person, not eligible to collect tax on supplies.</p>' : '') +
        (d.notes ? '<p class="small">' + esc(d.notes).replace(/\n/g, '<br>') + '</p>' : '') + '</div><div class="foot-r">' +
        K.tot([tax ? ['Taxable value', NS.money(o.taxable)] : null, tax && o.intra ? ['CGST', NS.money(o.cgst)] : null, tax && o.intra ? [sg, NS.money(o.sgst)] : null, tax && !o.intra ? ['IGST', NS.money(o.igst)] : null,
          o.roundOff ? ['Round off', (o.roundOff > 0 ? '+' : '−') + NS.money(Math.abs(o.roundOff))] : null, ['Total (' + NS.qty(o.qty) + ' qty)', NS.money(o.total), 'grand']]) + '</div></div>' +
      K.sign(d) + K.made() + '</div>';
  }
  var RATES = [0, 5, 18, 40, 3, 0.25, 12];

  function row(m) { return { desc: '', code: '', hsn: '', qty: 1, unit: 'Nos', price: '', rate: '', disc: '', gst: 18 }; }
  /* the price typed at the counter includes GST when "prices include GST" is ticked; rate = price without GST */
  function syncRate(d, it) {
    var p = num(it.price), g = d.kind === 'tax' ? num(it.gst) : 0;
    it.rate = p ? String(d.incl && g ? Math.round(p / (1 + g / 100) * 10000) / 10000 : p) : '';
  }
  function sums(d) {
    var tax = d.kind === 'tax', origin = d.seller.state, dest = d.buyer.state || origin, intra = !origin || !dest || origin === dest;
    var o = { rows: [], taxable: 0, tax: 0, cgst: 0, sgst: 0, igst: 0, byRate: {}, intra: intra, qty: 0 };
    d.items.forEach(function (it) {
      var q = num(it.qty), rate = num(it.rate);
      if (!it.desc && !rate) return;
      var taxable = r2(q * rate - q * rate * num(it.disc) / 100), g = tax ? num(it.gst) : 0, tx = r2(taxable * g / 100);
      o.rows.push({ it: it, taxable: taxable, g: g, tax: tx, amount: r2(taxable + tx) });
      o.taxable += taxable; o.tax += tx; o.qty += q;
      if (tax) { var b = o.byRate[g] || (o.byRate[g] = { taxable: 0, tax: 0 }); b.taxable += taxable; b.tax += tx; }
    });
    o.taxable = r2(o.taxable); o.tax = r2(o.tax);
    if (intra) { o.cgst = r2(o.tax / 2); o.sgst = r2(o.tax - o.cgst); } else o.igst = o.tax;
    var total = r2(o.taxable + o.tax);
    o.roundOff = r2(Math.round(total) - total); o.total = r2(total + o.roundOff);
    o.paid = d.payMode === 'cash' ? num(d.tender) : o.total;
    o.change = d.payMode === 'cash' && num(d.tender) ? r2(num(d.tender) - o.total) : 0;
    return o;
  }
  function kindFor(s) { return s.reg === 'comp' ? 'supply' : s.gstin && s.reg !== 'unreg' ? 'tax' : 'plain'; }

  /* ---------- counter search: name or code; Enter adds the first match (a USB scanner types the code and Enter) ---------- */
  function findItems(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    var exact = ITEMS.filter(function (x) { return String(x.code || '').toLowerCase() === q; });
    if (exact.length) return exact;
    return ITEMS.filter(function (x) { return (x.desc + ' ' + (x.code || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
  }
  function addItem(m) {
    var d = K.doc(), hit = d.items.filter(function (it) { return it.desc && (m.code ? it.code === m.code : it.desc.toLowerCase() === m.desc.toLowerCase()); })[0];
    if (hit) hit.qty = NS.qty(num(hit.qty) + 1).replace(/,/g, '');
    else {
      var it = row(), g = m.gst !== '' && m.gst != null ? num(m.gst) : 18;
      it.desc = m.desc; it.code = m.code || ''; it.hsn = m.hsn || ''; it.unit = m.unit || 'Nos'; it.gst = g;
      /* the item list keeps the rate without GST; the counter shows the shelf price */
      it.price = m.price != null && m.price !== '' ? String(m.price) : m.rate !== '' && m.rate != null ? String(d.incl && d.kind === 'tax' ? r2(num(m.rate) * (1 + g / 100)) : num(m.rate)) : '';
      syncRate(d, it);
      var empty = d.items.length === 1 && !d.items[0].desc && !num(d.items[0].price);
      if (empty) d.items[0] = it; else d.items.push(it);
    }
    K.refill(); beep();
  }
  function beep() {
    try { var a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 1200; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.08); setTimeout(function () { a.close(); }, 300); } catch (e) {}
  }
  function wireSearch(ed) {
    var q = $('#pos-q', ed), box = $('#pos-hits', ed);
    function show() {
      var hits = findItems(q.value);
      box.innerHTML = hits.map(function (m, i) { return '<li><button type="button" data-hit="' + i + '"><b>' + esc(m.desc) + '</b>' + (m.code ? ' <small class="mono">' + esc(m.code) + '</small>' : '') + '<span>' + (m.price || m.rate ? NS.money(num(m.price || m.rate)) : '') + '</span></button></li>'; }).join('') +
        (q.value.trim() ? '<li><button type="button" data-hit="new">' + esc(t('pos.addnew', { n: q.value.trim() })) + '</button></li>' : '');
      box.hidden = !q.value.trim();
      box._hits = hits;
    }
    q.addEventListener('input', show);
    q.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var hits = findItems(q.value);
      if (hits.length) { addItem(hits[0]); q.value = ''; show(); }
      else if (q.value.trim()) newItem(q.value.trim());
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-hit]'); if (!b) return;
      var h = b.getAttribute('data-hit');
      if (h === 'new') newItem(q.value.trim()); else addItem(box._hits[+h]);
      q.value = ''; show(); q.focus();
    });
  }
  /* an item not in the list yet: a code becomes the item's code, words become its name; the cashier types the rest on the line */
  function newItem(text) {
    var d = K.doc(), it = row(), isCode = /^[0-9A-Za-z\-]{6,}$/.test(text) && /\d/.test(text) && !/\s/.test(text);
    it.desc = isCode ? '' : text; it.code = isCode ? text : ''; it.gst = d.items.length && d.items[d.items.length - 1].gst !== '' ? d.items[d.items.length - 1].gst : 18;
    var empty = d.items.length === 1 && !d.items[0].desc && !num(d.items[0].price);
    if (empty) d.items[0] = it; else d.items.push(it);
    $('#pos-q', K.root()).value = '';
    K.refill();
    var i = d.items.indexOf(it), f = $('#r-items-' + (isCode ? 'desc' : 'price') + '-' + i, K.root());
    if (f) f.focus();
    NS.toast(t('pos.newitem'));
  }

  /* ---------- camera scan (BarcodeDetector: Chrome and Edge on Android; elsewhere a USB/Bluetooth scanner or typing) ---------- */
  var stream = null, timer = null;
  function scan() {
    var dlg = $('#pos-cam');
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) { NS.toast(t('pos.nocam'), 'bad'); return; }
    var det;
    try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf'] }); } catch (e) { det = new BarcodeDetector(); }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
      stream = s; var v = $('video', dlg); v.srcObject = s; v.play();
      dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
      var last = '';
      timer = setInterval(function () {
        if (v.readyState < 2) return;
        det.detect(v).then(function (codes) {
          if (!codes.length) return;
          var c = String(codes[0].rawValue || '').trim(); if (!c || c === last) return;
          last = c; setTimeout(function () { last = ''; }, 1500);
          var hit = ITEMS.filter(function (x) { return String(x.code || '') === c; })[0];
          if (hit) { addItem(hit); NS.toast(t('pos.added', { n: hit.desc })); }
          else { stopCam(); dlg.close(); newItem(c); }
        }).catch(function () {});
      }, 300);
    }).catch(function () { NS.toast(t('pos.camno'), 'bad'); });
  }
  function stopCam() { clearInterval(timer); timer = null; if (stream) stream.getTracks().forEach(function (x) { x.stop(); }); stream = null; }

  /* ---------- today's sales: count and money by mode, for closing the counter ---------- */
  function today() {
    var dlg = $('#pos-day'), d0 = K.doc().date || NS.today(), who = String(K.doc().seller.name || '').trim().toLowerCase();
    NSStore.list('doc').then(function (all) {
      var bills = all.filter(function (x) { return x.counter && x.date === d0 && String(x.seller && x.seller.name || '').trim().toLowerCase() === who; });
      var by = {}, tot = 0;
      bills.forEach(function (b) { var m = b.payMode || 'cash'; by[m] = r2((by[m] || 0) + num(b.total)); tot = r2(tot + num(b.total)); });
      $('[data-day]', dlg).innerHTML = '<p>' + esc(t('pos.dayof', { d: NS.fmtDate(d0), n: bills.length })) + '</p><table class="day"><tbody>' +
        ['cash', 'upi', 'card'].map(function (m) { return '<tr><th>' + esc(t('pm.' + m)) + '</th><td>' + NS.money(by[m] || 0) + '</td></tr>'; }).join('') +
        '<tr class="grand"><th>' + esc(t('pos.daytot')) + '</th><td>' + NS.money(tot) + '</td></tr></tbody></table><p class="hint">' + esc(t('pos.dayh')) + '</p>';
      dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
    });
  }

  K = NS.kit({
    type: 'pos', docType: 'invoice', prefix: 'POS', digits: 4, paper: 'th80', papers: ['th80', 'th58', 'a5', 'a4'],
    mine: function (d) { return !!d.counter; },
    name: function (d) { return d.kind === 'tax' ? 'Invoice' : d.kind === 'supply' ? 'Bill of Supply' : 'Cash Memo'; },
    blank: function () { return { counter: 1, pos: '', kind: 'plain', incl: true, round: true, status: 'paid', payMode: 'cash', tender: '', time: '', items: [row()] }; },
    newRow: function (n, d) { var it = row(); it.gst = d.items.length ? d.items[d.items.length - 1].gst : 18; return it; },
    keepOnNew: function (d) { return { kind: d.kind, incl: d.incl, paper: d.paper }; },
    form: function (K) {
      var d = K.doc();
      return '<div class="pos-bar"><label for="pos-q" class="sr">' + esc(t('pos.search')) + '</label>' +
          '<input id="pos-q" type="search" autocomplete="off" enterkeyhint="go" placeholder="' + esc(t('pos.search')) + '">' +
          '<button type="button" class="btn" data-pos="scan">' + esc(t('pos.scan')) + '</button><ul class="pos-hits" id="pos-hits" hidden></ul></div>' +
        K.card(t('pos.cart'), K.list('items', t('add.item')) + '<div class="sums" id="ed-sums" aria-live="polite"></div>') +
        K.card(t('pos.pay'), '<div class="fg">' +
          K.f('payMode', t('pos.mode'), { type: 'select', opts: K.modes(['cash', 'upi', 'card']) }) +
          K.f('tender', t('pos.given'), { mode: 'decimal', ltr: 1, show: 'payMode=cash', hint: t('pos.givenh') }) +
          '<div class="f wide pos-change" id="pos-change" aria-live="polite"></div>' +
          '<div class="f wide pos-upi" id="pos-upi" hidden></div>' +
          '</div><div class="row pos-go"><button type="button" class="btn primary" data-pos="saveprint">' + esc(t('pos.saveprint')) + '</button><button type="button" class="btn" data-pos="savenew">' + esc(t('pos.savenew')) + '</button><button type="button" class="btn" data-pos="day">' + esc(t('pos.today')) + '</button></div>') +
        '<details class="more card"><summary>' + esc(t('pos.cust')) + '</summary><div class="fg">' + K.f('buyer.name', t('l.cname'), { wide: true }) + K.f('buyer.phone', t('l.phone'), { type: 'tel', mode: 'tel', ltr: 1 }) +
          K.f('buyer.gstin', t('l.cgstin'), { max: 15, ltr: 1, hint: t('pos.b2b') }) + K.f('buyer.state', t('l.state'), { type: 'select', opts: K.states() }) + K.f('buyer.addr', t('l.addr'), { type: 'textarea', wide: true, hint: t('pos.b50') }) + '</div></details>' +
        '<details class="more card"' + (d.seller.name ? '' : ' open') + '><summary>' + esc(t('pos.shop')) + '</summary>' +
          K.bizCard({ lg: t('lg.biz') }).replace(/^<fieldset class="card">/, '<fieldset class="card flat">') +
          K.card(t('pos.billset'), '<div class="fg">' +
            K.f('kind', t('pos.kind'), { type: 'select', opts: [['tax', t('k.tax')], ['supply', t('k.supply')], ['plain', t('k.cashmemo')]], wide: true, hint: t('pos.kindh') }) +
            K.f('incl', t('pos.incl'), { type: 'check', show: 'kind=tax', hint: t('pos.inclh') }) +
            K.f('no', K.tw('l.no'), { max: 16, ltr: 1, hint: t('h.no2') }) + K.f('date', t('l.date'), { type: 'date' }) +
            K.f('paper', t('l.paper'), { type: 'select', opts: ['th80', 'th58', 'a5', 'a4'].map(function (k) { return [k, t('pp.' + k)]; }) }) +
            K.design('paper=a4|a5') +
            K.f('notes', t('l.notes'), { type: 'textarea', wide: true, ph: t('pos.noteph') }) + '</div>') + '</details>' +
        '<datalist id="dl-units"><option value="Nos"><option value="Pcs"><option value="Kg"><option value="Gm"><option value="Ltr"><option value="Pack"><option value="Box"><option value="Dozen"></datalist>' +
        '<datalist id="dl-rates">' + RATES.map(function (r) { return '<option value="' + r + '">'; }).join('') + '</datalist>';
    },
    rows: {
      items: function (it, i, K) {
        var d = K.doc();
        return K.rf('items', i, 'desc', t('l.desc'), { cls: 'it-d', sug: 'item', ph: t('ph.desc') }) +
          '<div class="f pos-qty"><label for="r-items-qty-' + i + '">' + esc(t('l.qty')) + '</label><div class="step"><button type="button" class="btn sm" data-step="' + i + ':-1" aria-label="−1">−</button><input id="r-items-qty-' + i + '" data-r="items" data-i="' + i + '" data-k="qty" value="' + esc(it.qty) + '" inputmode="decimal" dir="ltr"><button type="button" class="btn sm" data-step="' + i + ':1" aria-label="+1">+</button></div></div>' +
          K.rf('items', i, 'price', t(d.kind === 'tax' && d.incl ? 'pos.price' : 'l.rate'), { mode: 'decimal', ltr: 1 }) +
          (d.kind === 'tax' ? K.rf('items', i, 'gst', t('l.gst'), { mode: 'decimal', ltr: 1, list: 'dl-rates', cls: 'it-gst' }) + K.rf('items', i, 'hsn', t('l.hsn'), { mode: 'numeric', max: 8, ltr: 1 }) : '') +
          K.rf('items', i, 'code', t('pos.code'), { ltr: 1, mode: 'numeric' }) + K.rf('items', i, 'unit', t('l.unit'), { list: 'dl-units', ltr: 1 });
      }
    },
    rowInput: function (n, i, k, d) { if (k === 'price' || k === 'gst') syncRate(d, d.items[i]); },
    rowsDrawn: function (n, box, K) {
      $$('[data-step]', box).forEach(function (b) {
        b.addEventListener('click', function () {
          var x = b.getAttribute('data-step').split(':'), it = K.doc().items[+x[0]];
          it.qty = String(Math.max(0, r2(num(it.qty) + +x[1])));
          if (!num(it.qty) && K.doc().items.length > 1) K.doc().items.splice(+x[0], 1);
          K.refill();
        });
      });
    },
    pickItem: function (it, m, d) {
      var g = m.gst !== '' && m.gst != null ? num(m.gst) : it.gst;
      it.desc = m.desc; it.code = m.code || it.code; it.hsn = m.hsn || it.hsn; it.unit = m.unit || it.unit; it.gst = g;
      if (m.rate !== '' && m.rate != null) it.price = String(d.incl && d.kind === 'tax' ? r2(num(m.rate) * (1 + g / 100)) : num(m.rate));
      syncRate(d, it);
    },
    input: function (p, el, d) {
      if (p === 'kind' || p === 'incl') { d.items.forEach(function (it) { syncRate(d, it); }); K.refill(); }
      if (p === 'seller.gstin' || p === 'seller.name') { var k = kindFor(d.seller); if (k !== d.kind && !K.editing()) { d.kind = k; d.items.forEach(function (it) { syncRate(d, it); }); K.refill(); } }
    },
    pickParty: function () {},
    sums: sums,
    edSums: function (d, o) {
      return '<span>' + esc(t('sum.items', { n: o.rows.length })) + '</span>' + (d.kind === 'tax' ? '<span>' + esc(t('sum.gst', { v: NS.money(o.tax) })) + '</span>' : '') + '<b class="pos-big">' + esc(t('sum.total', { v: NS.money(o.total) })) + '</b>';
    },
    look: function (ed, d, K) {
      var o = sums(d), ch = $('#pos-change', ed), up = $('#pos-upi', ed);
      if (ch) ch.innerHTML = d.payMode === 'cash' && num(d.tender) ? (o.change >= 0 ? '<b class="pos-big ok">' + esc(t('pos.change', { v: NS.money(o.change) })) + '</b>' : '<b class="pos-big bad">' + esc(t('pos.short', { v: NS.money(-o.change) })) + '</b>') : '';
      if (up) {
        up.hidden = d.payMode !== 'upi' || !o.total;
        if (!up.hidden) {
          if (!d.seller.upi) up.innerHTML = '<p class="hint">' + esc(t('pos.noupi')) + '</p>';
          else if (window.qrcode) {
            var link = 'upi://pay?pa=' + encodeURIComponent(d.seller.upi.trim()) + '&pn=' + encodeURIComponent((d.seller.name || '').slice(0, 40)) + '&am=' + o.total.toFixed(2) + '&cu=INR&tn=' + encodeURIComponent(('Bill ' + d.no).slice(0, 40));
            try { var qr = qrcode(0, 'M'); qr.addData(link); qr.make(); up.innerHTML = '<div class="pos-qr">' + qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) + '</div><p><b>' + NS.money(o.total) + '</b> · <span class="mono">' + esc(d.seller.upi) + '</span></p><p class="hint">' + esc(t('pos.upih')) + '</p>'; } catch (e) { up.innerHTML = ''; }
          }
        }
      }
      $$('.it-gst', ed).forEach(function (f) { f.hidden = d.kind !== 'tax'; });
    },
    validate: function (d, o) {
      var p = [];
      if (!o.rows.length) p.push(['r-items-desc-0', t('v.item')]);
      o.rows.forEach(function (r, i) { if (!r.it.desc) p.push(['r-items-desc-' + d.items.indexOf(r.it), t('pos.v.name')]); });
      if (d.kind === 'tax' && !d.seller.gstin) p.push(['k-seller-gstin', t('v.tax')]);
      /* Rule 46: an unregistered buyer's name, address and state when the taxable value is Rs 50,000 or more */
      if (d.kind === 'tax' && !d.buyer.gstin && o.taxable >= 50000 && (!d.buyer.name || !d.buyer.addr || !d.buyer.state)) p.push([!d.buyer.name ? 'k-buyer-name' : !d.buyer.addr ? 'k-buyer-addr' : 'k-buyer-state', t('v.b2c')]);
      if (d.payMode === 'cash' && num(d.tender) && o.change < 0) p.push(['k-tender', t('pos.v.short')]);
      return p;
    },
    confirm: function (d, o) { return d.payMode === 'cash' && o.total >= 200000 ? t('c.cash2l') : ''; },
    masterItems: function (d) { return d.items.filter(function (it) { return it.desc; }).map(function (it) { return { desc: String(it.desc).trim(), code: it.code || '', hsn: it.hsn || '', unit: it.unit || 'Nos', rate: it.rate, gst: d.kind === 'tax' ? it.gst : '' }; }); },
    record: function (rec, o) {
      rec.time = rec.time || new Date().toTimeString().slice(0, 5);
      rec.items = rec.items.filter(function (it) { return it.desc || num(it.rate); });
      rec.withGst = rec.kind === 'tax'; rec.status = 'paid'; rec.round = true; rec.change = o.change;
    },
    saved: function () { NSStore.list('item').then(function (l) { ITEMS = l; }); },
    copyOf: function (d) { d.tender = ''; d.time = ''; d.buyer = { name: '', addr: '', city: '', pin: '', state: '', gstin: '', phone: '' }; },
    histPill: function (d) { return ' <span class="pill ok">' + esc(t('pm.' + (d.payMode || 'cash'))) + '</span>'; },
    shareText: function (d, o) { return '\nPaid by: ' + K.mode(d.payMode); },
    upiShare: false,
    sheet: function (d, o, K) {
      if (!/^th/.test(d.paper)) return page(d, o, K);
      var tax = d.kind === 'tax', b = d.buyer, line = function (l, r, c) { return [l, r, c]; };
      var head = K.thOpen(d, TITLE[d.kind]) + K.kv([line(d.kind === 'plain' ? 'Memo No.' : 'Bill No.', '<span class="mono">' + esc(d.no) + '</span>'), line('Date', NS.fmtDate(d.date) + (d.time ? ' ' + esc(d.time) : '')),
        b.name ? line('Customer', esc(b.name)) : null, b.gstin ? line('GSTIN', '<span class="mono">' + esc(b.gstin) + '</span>') : null, b.phone ? line('Phone', esc(b.phone)) : null]);
      var lines = '<table class="tl"><thead><tr><th class="l">Item</th><th class="n">Amount</th></tr></thead><tbody>' + (o.rows.length ? o.rows.map(function (r) {
        return '<tr><td colspan="2" class="l">' + esc(r.it.desc) + (tax && r.it.hsn ? ' <small class="mono">' + esc(r.it.hsn) + '</small>' : '') + '</td></tr><tr class="q"><td class="l">' + NS.qty(num(r.it.qty)) + ' ' + esc(r.it.unit) + ' × ' + NS.money(tax ? num(r.it.rate) : num(r.it.price || r.it.rate), false) + (tax ? ' +' + r.g + '%' : '') + '</td><td class="n">' + NS.money(r.amount, false) + '</td></tr>';
      }).join('') : '<tr><td colspan="2" class="ph">Items you add appear here</td></tr>') + '</tbody></table>';
      var sg = { '04': 1, '26': 1, '31': 1, '35': 1, '38': 1 }[d.seller.state] ? 'UTGST' : 'SGST';
      var tot = K.kv([tax ? line('Taxable value', NS.money(o.taxable)) : null, tax && o.intra ? line('CGST', NS.money(o.cgst)) : null, tax && o.intra ? line(sg, NS.money(o.sgst)) : null, tax && !o.intra ? line('IGST', NS.money(o.igst)) : null,
        o.roundOff ? line('Round off', (o.roundOff > 0 ? '+' : '−') + NS.money(Math.abs(o.roundOff))) : null, line('Total (' + NS.qty(o.qty) + ' qty)', NS.money(o.total), 'grand')], 'tot');
      var rates = tax && Object.keys(o.byRate).length ? '<table class="tl gs"><thead><tr><th class="l">GST %</th><th class="n">Taxable</th><th class="n">Tax</th></tr></thead><tbody>' + Object.keys(o.byRate).sort(function (a, b) { return a - b; }).map(function (g) { var x = o.byRate[g]; return '<tr><td class="l">' + g + '%</td><td class="n">' + NS.money(x.taxable, false) + '</td><td class="n">' + NS.money(x.tax, false) + '</td></tr>'; }).join('') + '</tbody></table>' : '';
      var pay = K.kv([line('Paid by', K.mode(d.payMode)), d.payMode === 'cash' && num(d.tender) ? line('Cash given', NS.money(num(d.tender))) : null, d.payMode === 'cash' && num(d.tender) ? line('Change', NS.money(Math.max(0, o.change))) : null]);
      return head + lines + tot + (o.total ? '<p class="words">' + NS.inWords(o.total) + '</p>' : '') + rates +
        (d.kind === 'supply' ? '<p class="nt1">Composition taxable person, not eligible to collect tax on supplies.</p>' : '') + pay +
        (d.notes ? '<p class="nt1">' + esc(d.notes).replace(/\n/g, '<br>') + '</p>' : '') + '<p class="thanks">Thank you, visit again</p>' + K.made() + '</div>';
    },
    wire: function (ed, K) {
      wireSearch(ed);
      $$('[data-pos]', ed).forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.getAttribute('data-pos');
          if (a === 'scan') scan();
          else if (a === 'day') today();
          else if (a === 'saveprint') K.save().then(function () { K.print(); setTimeout(function () { K.startNew(); $('#pos-q').focus(); }, 1500); }).catch(function () {});
          else if (a === 'savenew') K.save().then(function () { K.startNew(); $('#pos-q').focus(); }).catch(function () {});
        });
      });
    },
    ready: function (K) {
      NSStore.list('item').then(function (l) { ITEMS = l; });
      var d = K.doc();
      if (!K.editing() && d.seller.name && !d.items.some(function (it) { return it.desc; })) { var k = kindFor(d.seller); if (k !== d.kind) { d.kind = k; K.refill(); } }
      /* the camera and day-total windows live outside the form, so a language change never closes them */
      function dlg(id, title, inner) {
        var x = NS.el('dialog', { id: id, 'aria-labelledby': id + '-h' }, '<div class="dlg-h"><h2 id="' + id + '-h"></h2><button type="button" class="btn sm" data-close></button></div><div class="dlg-b">' + inner + '</div>');
        document.body.appendChild(x);
        $('[data-close]', x).addEventListener('click', function () { x.close(); });
        x._title = title; return x;
      }
      var cam = dlg('pos-cam', 'pos.camt', '<video class="pos-video" playsinline muted></video><p class="hint" data-camh></p>');
      cam.addEventListener('close', stopCam);
      dlg('pos-day', 'pos.today', '<div data-day></div>');
      function names() {
        [cam, $('#pos-day')].forEach(function (x) { $('h2', x).textContent = t(x._title); $('[data-close]', x).textContent = t('close'); });
        $('[data-camh]', cam).textContent = t('pos.camh');
      }
      names(); document.addEventListener('ns-lang', names);
    }
  });
})();
