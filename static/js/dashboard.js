/* ═══════════════════════════════════════════════════════════════════════
   Green Economy Monitoring System – dashboard.js
   يُحمَّل في جميع صفحات التطبيق بعد تسجيل الدخول
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

// ── أداة عرض Toast ──────────────────────────────────────────────────────────
const Toast = (() => {
  const ICONS = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error:   '<i class="fa-solid fa-circle-xmark"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
    info:    '<i class="fa-solid fa-circle-info"></i>'
  };
  let container;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${ICONS[type] || ''}</span><span>${message}</span>`;
    getContainer().appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  return { show };
})();

// ── طلبات API ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('show');
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      cache: options.cache || 'no-store',
      ...options,
    });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('انتهت الجلسة');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } finally {
    if (overlay) overlay.classList.remove('show');
  }
}

// ── badge الإشعارات في الـ sidebar ────────────────────────────────────────
function updateNotifBadge(count) {
  document.querySelectorAll('#sidebarAlertBadge').forEach(badge => {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// لوحة التحكم – Dashboard
// ══════════════════════════════════════════════════════════════════════════════
const DashboardPage = (() => {
  let chartInstances = {};

  const CHART_COLORS = {
    green:  'rgba(46,158,94,.85)',
    blue:   'rgba(2,136,209,.85)',
    orange: 'rgba(251,140,0,.85)',
    purple: 'rgba(142,36,170,.85)',
    teal:   'rgba(0,105,92,.85)',
    red:    'rgba(229,57,53,.85)',
  };

  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 12 } } },
      tooltip: { rtl: true, bodyFont: { family: 'Cairo, Segoe UI, sans-serif' } },
    },
    scales: {
      x: { ticks: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 11 } } },
      y: { ticks: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 11 } } },
    },
  };

  function destroyChart(id) {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      delete chartInstances[id];
    }
  }

  // ── تحديث بطاقات الإحصاء ──
  function updateStats(data) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    // ── عداد متحرك (animated counter) ──
    function animateCounter(el, targetRaw, formatter) {
      if (!el) return;
      const target = parseFloat(String(targetRaw).replace(/[^\d.]/g, '')) || 0;
      const start  = Date.now();
      const dur    = 900;
      (function step() {
        const p = Math.min((Date.now() - start) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        el.textContent = formatter(target * ease);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = formatter(target);
      })();
    }

    const yr = data.display_year || '';
    // أرقام بسيطة مع أنيميشن
    animateCounter(document.getElementById('statInstitutions'), data.total_institutions,
      v => Math.round(v).toString());
    animateCounter(document.getElementById('statEnergy'), data.total_energy,
      v => formatNumber(Math.round(v)) + ' MWh');
    animateCounter(document.getElementById('statCarbon'), data.total_carbon,
      v => formatNumber(Math.round(v)) + ' طن');
    animateCounter(document.getElementById('statProjects'), data.total_projects,
      v => Math.round(v).toString());
    animateCounter(document.getElementById('statRenewable'), data.avg_renewable,
      v => v.toFixed(1) + '%');
    animateCounter(document.getElementById('statTopCarbonVal'), data.top_carbon_value,
      v => formatNumber(Math.round(v)));
    animateCounter(document.getElementById('statBestRenewVal'), data.best_renew_value || 0,
      v => v.toFixed(1));
    animateCounter(document.getElementById('statYears'), data.years_count,
      v => Math.round(v).toString());
    animateCounter(document.getElementById('statRecords'), data.total_records,
      v => Math.round(v).toString());
    animateCounter(document.getElementById('statWater'), data.total_water || 0,
      v => formatNumber(Math.round(v)) + ' م³');
    animateCounter(document.getElementById('statWaste'), data.avg_waste || 0,
      v => v.toFixed(1) + '%');

    // قيم نصية لا يمكن تحريكها
    set('statTopCarbonName', data.top_carbon_name  || '–');
    set('statBestRenewName', data.best_renew_name  || '–');
    // تحديث وحدة السنة في البطاقات
    ['statEnergyYear','statCarbonYear','statProjectsYear'].forEach(id => set(id, yr));
  }

  // ── عرض التنبيهات ──
  function renderAlerts(alerts) {
    const container = document.getElementById('alertsContainer');
    if (!container) return;
    container.innerHTML = '';
    alerts.forEach(alert => {
      const el = document.createElement('div');
      el.className = `dashboard-alert ${alert.type}`;
      el.innerHTML = `
        <div class="alert-icon">${alert.type === 'danger' ? '<i class="fa-solid fa-circle-exclamation"></i>' : '<i class="fa-solid fa-triangle-exclamation"></i>'}</div>
        <div class="alert-body">
          <h4>تنبيه: انبعاثات الكربون</h4>
          <p>${alert.message}</p>
        </div>`;
      container.appendChild(el);
    });
  }

  // ── رسم انبعاثات الكربون ──
  function drawCarbonChart(labels, values) {
    destroyChart('carbonChart');
    const ctx = document.getElementById('carbonChart');
    if (!ctx) return;
    chartInstances['carbonChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'انبعاثات الكربون (طن)',
          data: values,
          backgroundColor: values.map(v =>
            v > 1000 ? 'rgba(229,57,53,.8)' : 'rgba(46,158,94,.8)'
          ),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { display: false },
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: {
              label: ctx => ` ${formatNumber(ctx.raw)} طن`,
            },
          },
        },
      },
    });
  }

  // ── رسم استهلاك الطاقة ──
  function drawEnergyChart(labels, values) {
    destroyChart('energyChart');
    const ctx = document.getElementById('energyChart');
    if (!ctx) return;
    chartInstances['energyChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'استهلاك الطاقة (MWh)',
          data: values,
          backgroundColor: CHART_COLORS.blue,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` ${formatNumber(ctx.raw)} MWh` },
          },
        },
      },
    });
  }

  // ── رسم نسبة الطاقة المتجددة (دائرة) ──
  function drawRenewableChart(labels, values) {
    destroyChart('renewableChart');
    const ctx = document.getElementById('renewableChart');
    if (!ctx) return;
    const colors = [
      CHART_COLORS.green, CHART_COLORS.teal, CHART_COLORS.blue,
      CHART_COLORS.purple, CHART_COLORS.orange, '#26a69a', '#66bb6a',
      '#42a5f5', '#ab47bc', '#ffa726',
    ];
    chartInstances['renewableChart'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, values.length),
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Cairo, Segoe UI, sans-serif', size: 11 },
              padding: 12,
            },
          },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}%` },
          },
        },
      },
    });
  }

  // ── رسم استهلاك المياه ──
  function drawWaterChart(labels, values) {
    destroyChart('waterChart');
    const ctx = document.getElementById('waterChart');
    if (!ctx) return;
    chartInstances['waterChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'استهلاك المياه (م³)',
          data: values,
          backgroundColor: 'rgba(66,165,245,.7)',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` ${formatNumber(ctx.raw)} م³` },
          },
        },
      },
    });
  }

  // ── رسم نسبة إعادة التدوير ──
  function drawWasteChart(labels, values) {
    destroyChart('wasteChart');
    const ctx = document.getElementById('wasteChart');
    if (!ctx) return;
    chartInstances['wasteChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'إعادة التدوير (%)',
          data: values,
          backgroundColor: 'rgba(171,71,188,.7)',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.raw}%` },
          },
        },
      },
    });
  }

  // ── قائمة المتصدرين ──
  function renderLeaderboard(resp) {
    const el = document.getElementById('leaderboardBody');
    if (!el) return;
    const items = (resp && resp.data) ? resp.data.slice(0, 5) : [];
    if (!items.length) {
      el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">لا توجد بيانات</p>';
      return;
    }
    const gradeClass = g => ({ 'A+': 'grade-aplus', 'A': 'grade-a', 'B': 'grade-b', 'C': 'grade-c', 'D': 'grade-d', 'F': 'grade-f' }[g] || '');
    el.innerHTML = items.map((inst, i) => `
      <div class="leaderboard-item">
        <div class="lb-rank lb-rank-${i + 1}">${i + 1}</div>
        <div class="lb-info">
          <div class="lb-name">${escHtml(inst.name)}</div>
          <div class="lb-bar-wrap"><div class="lb-bar-fill" style="width:${inst.green_score}%"></div></div>
        </div>
        <span class="lb-grade ${gradeClass(inst.grade)}">${inst.grade}</span>
        <span class="lb-score">${inst.green_score}/100</span>
      </div>`).join('');
  }

  // ── رسم توقعات AI (ويدجت مصغّر) ──
  function drawPredictionsWidget(data) {
    destroyChart('predictionsWidget');
    const bodyEl = document.getElementById('predictionsWidgetBody');
    if (!bodyEl) return;
    if (!data || data.error || !data.historical || data.historical.length < 2) {
      bodyEl.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:2rem">${data && data.error ? data.error : 'بيانات غير كافية للتنبؤ'}</p>`;
      return;
    }
    const hist  = data.historical;
    const preds = data.predictions || [];
    const histLabels = hist.map(h => String(h.year));
    const predLabels = preds.map(p => String(p.year));
    const allLabels  = [...histLabels, ...predLabels];
    const histVals   = hist.map(h => h.carbon);
    // للمجموعة الثانية: ابدأ من nil حتى نقطة التقاطع
    const predVals   = Array(hist.length - 1).fill(null);
    predVals.push(histVals[histVals.length - 1]); // توصيل الخطين
    preds.forEach(p => predVals.push(p.carbon));

    const ctx = document.getElementById('predictionsWidget');
    if (!ctx) return;
    chartInstances['predictionsWidget'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          {
            label: 'فعلي',
            data: histVals,
            borderColor: CHART_COLORS.green,
            backgroundColor: 'rgba(46,158,94,.15)',
            borderWidth: 3, fill: true, tension: .4,
            pointRadius: 5, pointBackgroundColor: CHART_COLORS.green,
          },
          {
            label: 'متوقع (AI)',
            data: predVals,
            borderColor: CHART_COLORS.blue,
            backgroundColor: 'rgba(2,136,209,.08)',
            borderWidth: 2, fill: false, tension: .4,
            borderDash: [6, 4],
            pointRadius: 5, pointBackgroundColor: CHART_COLORS.blue,
          },
        ],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          tooltip: {
            callbacks: { label: ctx => ` ${formatNumber(ctx.raw)} طن` },
          },
        },
      },
    });
  }

  // ── رسم اتجاه الانبعاثات ──
  function drawTrendChart(labels, values) {
    destroyChart('trendChart');
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    chartInstances['trendChart'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'إجمالي انبعاثات الكربون (طن)',
          data: values,
          borderColor: CHART_COLORS.green,
          backgroundColor: 'rgba(46,158,94,.12)',
          borderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: CHART_COLORS.green,
          fill: true,
          tension: .4,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          tooltip: {
            callbacks: { label: ctx => ` ${formatNumber(ctx.raw)} طن` },
          },
        },
      },
    });
  }

  async function init() {
    try {
      const [stats, charts, scores, preds, notifs] = await Promise.all([
        apiFetch('/api/dashboard-stats'),
        apiFetch('/api/chart-data'),
        apiFetch('/api/green-scores').catch(() => ({ data: [] })),
        apiFetch('/api/predictions').catch(e => ({ error: e.message })),
        apiFetch('/api/notifications').catch(() => null),
      ]);

      updateStats(stats);
      renderAlerts(stats.alerts);

      drawCarbonChart(charts.carbon.labels, charts.carbon.values);
      drawEnergyChart(charts.energy.labels, charts.energy.values);
      drawRenewableChart(charts.renewable.labels, charts.renewable.values);
      drawTrendChart(charts.trend.labels, charts.trend.values);
      if (charts.water)  drawWaterChart(charts.water.labels, charts.water.values);
      if (charts.waste)  drawWasteChart(charts.waste.labels, charts.waste.values);

      renderLeaderboard(scores);
      drawPredictionsWidget(preds);

      if (notifs) {
        renderEnergyMix(stats.avg_renewable || 0, stats.total_records || 0);
        renderRecentActivity(notifs.activities || []);
        // badge الإشعارات في الـ sidebar
        updateNotifBadge(notifs.high_carbon_count || 0);
      }

    } catch (err) {
      Toast.show('خطأ في تحميل بيانات لوحة التحكم: ' + err.message, 'error');
    }
  }

  // ── مزيج الطاقة المتجددة مقابل التقليدية ──
  function renderEnergyMix(avgRenewable, totalRecords) {
    const el = document.getElementById('energyMixContainer');
    if (!el) return;
    if (!totalRecords) {
      el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem"><i class="fa-solid fa-database" style="font-size:2rem;margin-bottom:.5rem;display:block"></i>لا توجد بيانات لعرض مزيج الطاقة</div>';
      return;
    }
    const renewable = Math.round(avgRenewable);
    const fossil    = 100 - renewable;
    el.innerHTML = `
      <div class="energy-mix-grid">
        <div class="energy-mix-item renewable">
          <div class="energy-mix-icon"><i class="fa-solid fa-sun"></i></div>
          <div class="energy-mix-info">
            <div class="energy-mix-pct">${renewable}%</div>
            <div class="energy-mix-label">طاقة متجددة</div>
          </div>
          <div class="energy-mix-bar-wrap">
            <div class="energy-mix-bar" style="width:${renewable}%;background:var(--primary)"></div>
          </div>
        </div>
        <div class="energy-mix-item fossil">
          <div class="energy-mix-icon"><i class="fa-solid fa-fire-flame-curved"></i></div>
          <div class="energy-mix-info">
            <div class="energy-mix-pct">${fossil}%</div>
            <div class="energy-mix-label">طاقة تقليدية</div>
          </div>
          <div class="energy-mix-bar-wrap">
            <div class="energy-mix-bar" style="width:${fossil}%;background:var(--danger)"></div>
          </div>
        </div>
        <div class="energy-mix-note">
          <i class="fa-solid fa-leaf"></i>
          ${renewable >= 50
            ? `<span style="color:var(--primary)">أداء ممتاز – الطاقة المتجددة تتجاوز النصف</span>`
            : `<span style="color:var(--warning)">هدف 2030: رفع الطاقة المتجددة فوق 50%</span>`}
        </div>
      </div>`;
  }

  // ── آخر النشاطات ──
  function renderRecentActivity(activities) {
    const el = document.getElementById('recentActivityBody');
    if (!el) return;
    if (!activities.length) {
      el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">لا توجد نشاطات بعد</p>';
      return;
    }
    const icons = {
      'إضافة مؤسسة': 'fa-solid fa-plus-circle',
      'تعديل مؤسسة': 'fa-solid fa-pen-to-square',
      'حذف مؤسسة': 'fa-solid fa-trash',
      'استيراد بيانات': 'fa-solid fa-file-arrow-up',
      'إضافة مستخدم': 'fa-solid fa-user-plus',
      'حذف مستخدم': 'fa-solid fa-user-minus',
    };
    el.innerHTML = activities.slice(0, 8).map(a => `
      <div class="activity-item">
        <div class="activity-icon"><i class="${icons[a.action] || 'fa-solid fa-circle-dot'}"></i></div>
        <div class="activity-info">
          <div class="activity-action">${escHtml(a.action)}</div>
          <div class="activity-detail">${escHtml(a.details || '')} <span class="activity-user">@${escHtml(a.username)}</span></div>
        </div>
        <div class="activity-time">${escHtml(a.created_at ? a.created_at.slice(0, 10) : '')}</div>
      </div>`).join('');
  }

  return { init };
})();

// ══════════════════════════════════════════════════════════════════════════════
// إدخال البيانات – Data Entry
// ══════════════════════════════════════════════════════════════════════════════
const DataEntryPage = (() => {
  let currentPage = 1;
  let searchTimer;

  // ── تحميل قائمة المؤسسات ──
  async function loadTable(page = 1) {
    currentPage = page;
    const search = document.getElementById('searchInput')?.value || '';
    const yearFilter = document.getElementById('yearFilter')?.value || '';

    const params = new URLSearchParams({ page, limit: 10 });
    if (search) params.set('name', search);
    if (yearFilter) params.set('year', yearFilter);

    try {
      const data = await apiFetch(`/api/institutions?${params}`);
      renderTable(data.data);
      renderPagination(data.page, data.pages, data.total);
    } catch (err) {
      Toast.show('خطأ في تحميل البيانات: ' + err.message, 'error');
    }
  }

  function renderTable(rows) {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted)">لا توجد بيانات</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const carbonClass = r.carbon_emissions > 1000 ? 'badge-red' : 'badge-green';
      return `
      <tr>
        <td><strong>${escHtml(r.name)}</strong></td>
        <td>${r.year}</td>
        <td>${formatNumber(r.energy_consumption)} MWh</td>
        <td>
          <div style="display:flex;align-items:center;gap:.5rem;">
            <span>${r.renewable_energy_percentage}%</span>
          </div>
          <div class="progress-bar-wrap" style="margin-top:.3rem;width:80px">
            <div class="progress-bar-fill" style="width:${r.renewable_energy_percentage}%"></div>
          </div>
        </td>
        <td><span class="badge ${carbonClass}">${formatNumber(r.carbon_emissions)} طن</span></td>
        <td>${r.green_projects}</td>
        <td>${formatNumber(r.water_usage || 0)} م³</td>
        <td>${(r.waste_recycling_percentage || 0).toFixed(1)}%</td>
        <td style="white-space:nowrap;display:flex;gap:.4rem">
          <button class="btn btn-sm btn-outline" onclick="DataEntryPage.openEdit(${r.id})" style="gap:.4rem"><i class="fa-solid fa-pen"></i> تعديل</button>
          <button class="btn btn-sm btn-danger" onclick="DataEntryPage.deleteRow(${r.id}, '${escHtml(r.name)}')" style="gap:.4rem"><i class="fa-solid fa-trash"></i> حذف</button>
        </td>
      </tr>`;
    }).join('');
  }

  function renderPagination(page, pages, total) {
    const el = document.getElementById('pagination');
    if (!el) return;
    if (pages <= 1) { el.innerHTML = ''; return; }
    let html = `<span style="font-size:.8rem;color:var(--text-muted)">إجمالي: ${total}</span>`;
    html += `<div style="display:flex;gap:.4rem;align-items:center">`;
    if (page > 1) html += `<button class="btn btn-sm btn-outline" onclick="DataEntryPage.goPage(${page-1})">‹ السابق</button>`;
    html += `<span style="font-size:.85rem;padding:0 .5rem">صفحة ${page} / ${pages}</span>`;
    if (page < pages) html += `<button class="btn btn-sm btn-outline" onclick="DataEntryPage.goPage(${page+1})">التالي ›</button>`;
    html += `</div>`;
    el.innerHTML = html;
  }

  // ── إرسال النموذج ──
  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    // تحويل الأنواع
    payload.year = parseInt(payload.year);
    payload.energy_consumption = parseFloat(payload.energy_consumption);
    payload.renewable_energy_percentage = parseFloat(payload.renewable_energy_percentage);
    payload.carbon_emissions = parseFloat(payload.carbon_emissions);
    payload.green_projects = parseInt(payload.green_projects);
    payload.water_usage = parseFloat(payload.water_usage || 0);
    payload.waste_recycling_percentage = parseFloat(payload.waste_recycling_percentage || 0);

    try {
      const res = await apiFetch('/api/institutions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      Toast.show(res.message, 'success');
      if (res.carbon_alert) {
        Toast.show('تنبيه: انبعاثات الكربون لهذه المؤسسة تتجاوز الحد المسموح به!', 'warning', 6000);
      }
      form.reset();
      loadTable(1);
      SettingsPage.refreshSystemInfo?.();
    } catch (err) {
      Toast.show('خطأ: ' + err.message, 'error');
    }
  }

  // ── فتح نافذة التعديل ──
  async function openEdit(id) {
    try {
      const rec = await apiFetch(`/api/institutions/${id}`);
      document.getElementById('editId').value               = rec.id;
      document.getElementById('editName').value             = rec.name;
      document.getElementById('editYear').value             = rec.year;
      document.getElementById('editEnergy').value           = rec.energy_consumption;
      document.getElementById('editRenewable').value        = rec.renewable_energy_percentage;
      document.getElementById('editCarbon').value           = rec.carbon_emissions;
      document.getElementById('editProjects').value         = rec.green_projects;
      document.getElementById('editWater').value            = rec.water_usage || 0;
      document.getElementById('editWaste').value            = rec.waste_recycling_percentage || 0;
      document.getElementById('editModal').style.display    = 'flex';
    } catch (err) {
      Toast.show('خطأ في تحميل السجل: ' + err.message, 'error');
    }
  }

  function closeEdit() {
    document.getElementById('editModal').style.display = 'none';
  }

  async function saveEdit() {
    const id = parseInt(document.getElementById('editId').value);
    const payload = {
      name:                        document.getElementById('editName').value.trim(),
      year:                        parseInt(document.getElementById('editYear').value),
      energy_consumption:          parseFloat(document.getElementById('editEnergy').value),
      renewable_energy_percentage: parseFloat(document.getElementById('editRenewable').value),
      carbon_emissions:            parseFloat(document.getElementById('editCarbon').value),
      green_projects:              parseInt(document.getElementById('editProjects').value),
      water_usage:                 parseFloat(document.getElementById('editWater').value || 0),
      waste_recycling_percentage:  parseFloat(document.getElementById('editWaste').value || 0),
    };
    if (!payload.name) { Toast.show('اسم المؤسسة مطلوب', 'warning'); return; }
    try {
      const res = await apiFetch(`/api/institutions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      Toast.show(res.message || 'تم التحديث بنجاح', 'success');
      if (res.carbon_alert) {
        Toast.show('تنبيه: انبعاثات الكربون لهذه المؤسسة تتجاوز الحد المسموح به!', 'warning', 6000);
      }
      closeEdit();
      loadTable(currentPage);
      SettingsPage.refreshSystemInfo?.();
    } catch (err) {
      Toast.show('خطأ في التحديث: ' + err.message, 'error');
    }
  }

  // ── حذف صف ──
  async function deleteRow(id, name) {
    if (!confirm(`هل أنت متأكد من حذف بيانات "${name}"؟`)) return;
    try {
      const res = await apiFetch(`/api/institutions/${id}`, { method: 'DELETE' });
      Toast.show(res.message, 'success');
      loadTable(currentPage);
      SettingsPage.refreshSystemInfo?.();
    } catch (err) {
      Toast.show('خطأ في الحذف: ' + err.message, 'error');
    }
  }

  function goPage(p) { loadTable(p); }

  async function loadYearFilter() {
    const sel = document.getElementById('yearFilter');
    if (!sel) return;
    try {
      const data = await apiFetch('/api/years');
      const current = sel.value;
      sel.innerHTML = '<option value="">كل السنوات</option>' +
        data.map(y => `<option value="${y}">${y}</option>`).join('');
      if (current) sel.value = current;
    } catch (_) { /* تجاهل – القائمة الافتراضية موجودة */ }
  }

  function init() {
    const form = document.getElementById('dataEntryForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadTable(1), 400);
      });
    }

    const yearFilter = document.getElementById('yearFilter');
    if (yearFilter) yearFilter.addEventListener('change', () => loadTable(1));

    loadYearFilter();
    loadTable(1);
  }

  return { init, loadTable, deleteRow, goPage, openEdit, closeEdit, saveEdit };
})();

// ══════════════════════════════════════════════════════════════════════════════
// التقارير – Reports
// ══════════════════════════════════════════════════════════════════════════════
const ReportsPage = (() => {
  let reportCharts = {};

  function destroyChart(id) {
    if (reportCharts[id]) { reportCharts[id].destroy(); delete reportCharts[id]; }
  }

  function renderYearlySummary(rows) {
    const tbody = document.getElementById('yearlySummaryBody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><strong>${r.year}</strong></td>
        <td>${r.institutions_count}</td>
        <td>${formatNumber(r.total_energy)} MWh</td>
        <td>${parseFloat(r.avg_renewable).toFixed(1)}%</td>
        <td>
          <span class="badge ${r.total_carbon > 5000 ? 'badge-red' : 'badge-green'}">
            ${formatNumber(r.total_carbon)} طن
          </span>
        </td>
        <td>${r.total_projects}</td>
        <td>${formatNumber(r.total_water || 0)} م³</td>
        <td>${parseFloat(r.avg_waste || 0).toFixed(1)}%</td>
      </tr>`).join('');
  }

  function renderTopEmitters(rows) {
    const el = document.getElementById('topEmittersList');
    if (!el) return;
    el.innerHTML = rows.map((r, i) => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 0;border-bottom:1px solid var(--border)">
        <span style="width:28px;height:28px;border-radius:50%;background:${i===0?'#ef534070':i===1?'#ff984070':'#ffc10770'};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem">${i+1}</span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem">${escHtml(r.name)}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${r.year}</div>
        </div>
        <span class="badge badge-red">${formatNumber(r.carbon_emissions)} طن</span>
      </div>`).join('');
  }

  function renderTopRenewable(rows) {
    const el = document.getElementById('topRenewableList');
    if (!el) return;
    el.innerHTML = rows.map((r, i) => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 0;border-bottom:1px solid var(--border)">
        <span style="width:28px;height:28px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem">${i+1}</span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem">${escHtml(r.name)}</div>
          <div class="progress-bar-wrap" style="margin-top:.3rem">
            <div class="progress-bar-fill" style="width:${r.renewable_energy_percentage}%"></div>
          </div>
        </div>
        <span class="badge badge-green">${r.renewable_energy_percentage}%</span>
      </div>`).join('');
  }

  function drawYearlyChart(rows) {
    destroyChart('yearlyChart');
    const ctx = document.getElementById('yearlyChart');
    if (!ctx) return;
    reportCharts['yearlyChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.year),
        datasets: [
          {
            label: 'انبعاثات الكربون (طن)',
            data: rows.map(r => parseFloat(r.total_carbon)),
            backgroundColor: 'rgba(229,57,53,.75)',
            borderRadius: 5,
            yAxisID: 'y',
          },
          {
            label: 'استهلاك الطاقة (MWh)',
            data: rows.map(r => parseFloat(r.total_energy)),
            backgroundColor: 'rgba(2,136,209,.75)',
            borderRadius: 5,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 12 } } },
        },
        scales: {
          y:  { type: 'linear', position: 'right', ticks: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 11 } } },
          y1: { type: 'linear', position: 'left',  ticks: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 11 } } },
          x:  { ticks: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 11 } } },
        },
      },
    });
  }

  async function init() {
    try {
      const data = await apiFetch('/api/reports');
      renderYearlySummary(data.yearly_summary);
      renderTopEmitters(data.top_emitters);
      renderTopRenewable(data.top_renewable);
      drawYearlyChart(data.yearly_summary.slice().reverse());
    } catch (err) {
      Toast.show('خطأ في تحميل التقارير: ' + err.message, 'error');
    }
  }

  // ── تصدير CSV ──
  function exportCSV() {
    const table = document.getElementById('yearlySummaryTable');
    if (!table) return;
    const rows = [...table.querySelectorAll('tr')];
    const csvContent = rows.map(row =>
      [...row.querySelectorAll('th,td')].map(cell => `"${cell.textContent.trim()}"`).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `green-economy-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('تم تصدير التقرير بنجاح', 'success');
  }

  // ── تصدير Excel ──
  function exportExcel() {
    window.location.href = '/api/export-excel';
    Toast.show('جارِ تحضير ملف Excel...', 'info');
  }

  return { init, exportCSV, exportExcel };
})();

// ══════════════════════════════════════════════════════════════════════════════
// مساعدات عامة
// ══════════════════════════════════════════════════════════════════════════════
function formatNumber(n) {
  // دائماً أرقام إنجليزية (لاتينية) بغض النظر عن لغة الواجهة
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// الوضع الليلي – Dark Mode
// ══════════════════════════════════════════════════════════════════════════════
const ThemeManager = (() => {
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = theme === 'dark'
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }

  function init() {
    const saved = localStorage.getItem('theme') || 'light';
    apply(saved);

    document.getElementById('themeToggle')?.addEventListener('click', () => {
      apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  return { 
    init,
    setTheme: apply,
    getTheme: () => document.documentElement.getAttribute('data-theme') || 'light'
  };
})();


// ══════════════════════════════════════════════════════════════════════════════
// اللغة – i18n (AR/EN)  ← القاموس محمَّل من translations.js
// ══════════════════════════════════════════════════════════════════════════════
const I18n = (() => {
  // يُقرأ القاموس من ملف translations.js المُحمَّل قبل هذا الملف
  const DICT = window.TRANSLATIONS || { ar: {}, en: {} };

  let current = localStorage.getItem('lang') || 'ar';

  function apply(lang) {
    current = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (DICT[lang]?.[key]) el.textContent = DICT[lang][key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      if (DICT[lang]?.[key]) el.setAttribute('placeholder', DICT[lang][key]);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      if (DICT[lang]?.[key]) el.setAttribute('title', DICT[lang][key]);
    });
    const langBtn = document.getElementById('langToggle');
    if (langBtn) langBtn.textContent = lang === 'ar' ? 'EN' : 'عر';
  }

  function init() {
    apply(current);
    document.getElementById('langToggle')?.addEventListener('click', () => {
      apply(current === 'ar' ? 'en' : 'ar');
    });
  }

  function t(key) { return DICT[current]?.[key] || key; }

  return { 
  init, 
  t,
  setLang: apply,
  getCurrentLang: () => current
};
})();

// ══════════════════════════════════════════════════════════════════════════════
// مؤشر الأداء البيئي – Green Score
// ══════════════════════════════════════════════════════════════════════════════
const GreenScorePage = (() => {
  const GRADE_COLORS = {
    'A+': '#1b5e20', A: '#2e7d32', B: '#558b2f', C: '#f9a825', D: '#e65100', F: '#b71c1c',
  };

  function renderYearTabs(years, active) {
    const container = document.getElementById('yearTabs');
    if (!container) return;
    container.innerHTML = years.map(y =>
      `<button class="year-tab${y === active ? ' active' : ''}" onclick="GreenScorePage.loadYear(${y})">${y}</button>`
    ).join('');
  }

  async function loadYear(year) {
    try {
      const resp = await apiFetch(`/api/green-scores?year=${year}`);
      const data = resp.data || resp;          // يدعم كلا الشكلين
      const container = document.getElementById('scoresGrid');
      if (!container) return;

      if (!data.length) {
        container.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem">لا توجد بيانات لهذا العام</p>`;
        return;
      }

      container.innerHTML = data.map(item => {
        const score = item.green_score ?? item.score ?? 0;
        const gradeClass = `grade-${item.grade.replace('+', '\\+')}`;
        const color = GRADE_COLORS[item.grade] || '#555';
        return `
        <div class="stat-card" style="cursor:default">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">
            <div>
              <div class="stat-label">${escHtml(item.name)}</div>
              <div class="stat-value" style="font-size:1.6rem">${score.toFixed(1)}<span style="font-size:.9rem;color:var(--text-muted)">/100</span></div>
            </div>
            <span class="score-badge ${gradeClass}">${item.grade}</span>
          </div>
          <div class="score-bar-wrap" style="margin-top:.75rem">
            <div class="score-bar-fill" style="width:${score}%;background:${color}"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.4rem;margin-top:.75rem;font-size:.75rem;color:var(--text-muted)">
            <span><i class="fa-solid fa-cloud" style="color:#ef5350"></i> ${formatNumber(item.carbon_emissions)} طن</span>
            <span><i class="fa-solid fa-bolt" style="color:#ffa726"></i> ${item.renewable_energy_percentage}% متجدد</span>
            <span><i class="fa-solid fa-seedling" style="color:#66bb6a"></i> ${item.green_projects} مشروع</span>
            <span><i class="fa-solid fa-droplet" style="color:#42a5f5"></i> ${formatNumber(item.water_usage || 0)} م³</span>
            <span><i class="fa-solid fa-recycle" style="color:#ab47bc"></i> ${parseFloat(item.waste_recycling_percentage || 0).toFixed(1)}%</span>
          </div>
        </div>`;
      }).join('');

      // حدّث SVG circle بمتوسط النتائج
      const avgScore = data.reduce((s, i) => s + (i.green_score ?? 0), 0) / data.length;
      const gradeCount = { 'A+':0, A:0, B:0, C:0, D:0, F:0 };
      data.forEach(i => { if (gradeCount[i.grade] !== undefined) gradeCount[i.grade]++; });
      const best = Object.entries(gradeCount).sort((a,b)=>b[1]-a[1])[0][0];

      const summaryEl = document.getElementById('svgSummaryGrade');
      const countEl   = document.getElementById('svgSummaryCount');
      if (summaryEl) summaryEl.textContent = best;
      if (countEl)   countEl.textContent   = data.length + ' مؤسسة';
      GreenScorePage.animateSvgCircle(Math.round(avgScore * 10) / 10);

      // تحديث التبويبات
      document.querySelectorAll('.year-tab').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.textContent) === year);
      });
    } catch (err) {
      Toast.show('خطأ في تحميل مؤشرات الأداء: ' + err.message, 'error');
    }
  }

  async function init() {
    try {
      const data = await apiFetch('/api/reports');
      const years = data.yearly_summary.map(r => r.year).sort((a, b) => b - a);
      if (!years.length) return;
      renderYearTabs(years, years[0]);
      await loadYear(years[0]);
    } catch (err) {
      Toast.show('خطأ في تهيئة الصفحة: ' + err.message, 'error');
    }
  }

  function animateSvgCircle(score) {
    const circle = document.getElementById('svgScoreCircle');
    const numEl  = document.getElementById('svgScoreValue');
    if (!circle || !numEl) return;
    const circumference = 330;
    const offset = circumference - (circumference * score / 100);
    circle.style.strokeDashoffset = offset;
    // أنيميت الرقم
    let current = 0;
    const step = () => {
      current = Math.min(current + 1.5, score);
      numEl.textContent = current.toFixed(0);
      if (current < score) requestAnimationFrame(step);
      else numEl.textContent = score.toFixed(1);
    };
    requestAnimationFrame(step);
  }

  return { init, loadYear, animateSvgCircle };
})();

// ══════════════════════════════════════════════════════════════════════════════
// توقعات AI – Predictions
// ══════════════════════════════════════════════════════════════════════════════
const PredictionsPage = (() => {
  let predChart = null;

  async function loadInstitutions() {
    const sel = document.getElementById('predInstitution');
    if (!sel) return;
    try {
      const data = await apiFetch('/api/institution-names');
      // أضف خيار "جميع المؤسسات" أولاً ثم الأسماء
      sel.innerHTML =
        `<option value="">جميع المؤسسات (إجمالي)</option>` +
        data.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
    } catch (err) {
      Toast.show('خطأ في تحميل المؤسسات: ' + err.message, 'error');
    }
  }

  async function load() {
    const sel  = document.getElementById('predInstitution');
    const name = sel?.value ?? '';          // قيمة فارغة = إجمالي كل المؤسسات

    try {
      const url  = name
        ? `/api/predictions?name=${encodeURIComponent(name)}`
        : '/api/predictions';
      const data = await apiFetch(url);

      drawChart(data);
      renderTable(data.historical, data.predictions);
    } catch (err) {
      Toast.show('⚠ ' + err.message, 'warning');
    }
  }

  function drawChart(data) {
    if (predChart) { predChart.destroy(); predChart = null; }
    const ctx = document.getElementById('predChart');
    if (!ctx) return;

    // الـ API يُرجع historical[].carbon  و  predictions[].carbon
    const histLabels  = data.historical.map(r => r.year);
    const histCarbon  = data.historical.map(r => r.carbon);
    const predLabels  = data.predictions.map(r => r.year);
    const predCarbon  = data.predictions.map(r => r.carbon);
    const allLabels   = [...new Set([...histLabels, ...predLabels])].sort();

    predChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          {
            label: 'انبعاثات الكربون (تاريخي)',
            data: allLabels.map(y => histLabels.includes(y) ? histCarbon[histLabels.indexOf(y)] : null),
            borderColor: 'rgba(46,158,94,1)',
            backgroundColor: 'rgba(46,158,94,.1)',
            borderWidth: 3,
            pointRadius: 6,
            fill: true,
            tension: .4,
            spanGaps: false,
          },
          {
            label: 'انبعاثات الكربون (متوقعة)',
            data: allLabels.map(y => predLabels.includes(y) ? predCarbon[predLabels.indexOf(y)] : null),
            borderColor: 'rgba(229,57,53,1)',
            backgroundColor: 'rgba(229,57,53,.08)',
            borderWidth: 3,
            borderDash: [8, 4],
            pointRadius: 7,
            pointStyle: 'rectRot',
            fill: true,
            tension: .4,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 12 } } },
          tooltip: {
            rtl: true,
            bodyFont: { family: 'Cairo, Segoe UI, sans-serif' },
            callbacks: { label: ctx => ` ${formatNumber(ctx.raw)} طن` },
          },
        },
        scales: {
          x: { ticks: { font: { family: 'Cairo, Segoe UI, sans-serif', size: 11 } } },
          y: {
            ticks: {
              font: { family: 'Cairo, Segoe UI, sans-serif', size: 11 },
              callback: v => formatNumber(v),
            },
          },
        },
      },
    });
  }

  function renderTable(historical, predictions) {
    const tbody = document.getElementById('predTableBody');
    if (!tbody) return;

    // احسب trend_pct من البيانات التاريخية + التوقعات مرتبة
    const allByYear = [
      ...historical.map(r => ({ year: r.year, carbon: r.carbon })),
      ...predictions.map(r => ({ year: r.year, carbon: r.carbon })),
    ].sort((a, b) => a.year - b.year);

    const trendIcon = pct => pct > 0
      ? `<span style="color:#ef5350"><i class="fa-solid fa-arrow-trend-up"></i> +${pct.toFixed(1)}%</span>`
      : `<span style="color:#4caf50"><i class="fa-solid fa-arrow-trend-down"></i> ${pct.toFixed(1)}%</span>`;

    tbody.innerHTML = predictions.map(r => {
      // ابحث عن السنة السابقة في allByYear
      const prevEntry = allByYear.filter(e => e.year < r.year).pop();
      const trendPct  = prevEntry && prevEntry.carbon
        ? ((r.carbon - prevEntry.carbon) / prevEntry.carbon) * 100
        : 0;
      return `
      <tr>
        <td><strong>${r.year}</strong></td>
        <td>${formatNumber(r.carbon)} طن</td>
        <td>${formatNumber(r.energy)} MWh</td>
        <td>${formatNumber(r.water || 0)} م³</td>
        <td>${(r.waste != null ? r.waste : 0).toFixed(1)}%</td>
        <td>${trendIcon(trendPct)}</td>
      </tr>`;
    }).join('');
  }

  async function init() {
    await loadInstitutions();
    // حمّل التوقعات فوراً بإجمالي كل المؤسسات
    await load();
    document.getElementById('predictBtn')?.addEventListener('click', load);
    // تهيئة محاكي السياسات
    PolicySimulator.init();
  }

  return { init, load };
})();

// ══════════════════════════════════════════════════════════════════════════════
// محاكي أثر السياسات – Policy Simulator
// ══════════════════════════════════════════════════════════════════════════════
const PolicySimulator = (() => {
  function update() {
    const carbonTax  = parseInt(document.getElementById('simCarbonTax')?.value  || 30);
    const subsidy    = parseInt(document.getElementById('simSubsidy')?.value     || 50);
    const efficiency = parseInt(document.getElementById('simEfficiency')?.value  || 70);

    const carbonTaxEl  = document.getElementById('simCarbonTaxVal');
    const subsidyEl    = document.getElementById('simSubsidyVal');
    const efficiencyEl = document.getElementById('simEfficiencyVal');
    if (carbonTaxEl)  carbonTaxEl.textContent  = carbonTax  + '%';
    if (subsidyEl)    subsidyEl.textContent    = subsidy    + '%';
    if (efficiencyEl) efficiencyEl.textContent = efficiency + '%';

    const score = Math.round(carbonTax * 0.3 + subsidy * 0.4 + efficiency * 0.3);
    let grade, status, msg;
    if      (score >= 80) { grade='A+'; status='ممتاز';       msg='بناءً على السياسات المحددة، يُتوقع تحقيق أهداف 2030 قبل الموعد بسنتين'; }
    else if (score >= 60) { grade='B+'; status='جيد جداً';    msg='السياسات الحالية ستحقق معظم أهداف الاستدامة في الموعد المحدد'; }
    else if (score >= 40) { grade='C';  status='متوسط';        msg='يُنصح بزيادة مستوى السياسات لضمان تحقيق الأهداف'; }
    else                  { grade='D';  status='يحتاج تحسين'; msg='السياسات الحالية غير كافية – يُرجى مراجعة المعايير'; }

    const gradeEl  = document.getElementById('simGrade');
    const statusEl = document.getElementById('simStatus');
    const msgEl    = document.getElementById('simMsg');
    if (gradeEl)  gradeEl.textContent  = grade;
    if (statusEl) statusEl.textContent = 'التقييم المتوقع: ' + status;
    if (msgEl)    msgEl.textContent    = msg;
  }

  function init() {
    ['simCarbonTax','simSubsidy','simEfficiency'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', update);
    });
    update();
  }

  return { init, update };
})();

// ══════════════════════════════════════════════════════════════════════════════
// مقارنة المؤسسات – Compare
// ══════════════════════════════════════════════════════════════════════════════
const ComparePage = (() => {
  let cmpChart   = null;
  let _lastData  = null;
  let _chartType = 'radar';

  // تعريف المؤشرات مع أيقوناتها ووحداتها واتجاه الأفضلية
  const METRICS = [
    { key: 'carbon_emissions',            ar: 'انبعاثات الكربون',  unit: 'طن',   icon: 'fa-solid fa-smog',         lowerBetter: true  },
    { key: 'energy_consumption',          ar: 'استهلاك الطاقة',    unit: 'MWh',  icon: 'fa-solid fa-bolt',         lowerBetter: true  },
    { key: 'renewable_energy_percentage', ar: 'الطاقة المتجددة',   unit: '%',    icon: 'fa-solid fa-sun',          lowerBetter: false },
    { key: 'green_projects',              ar: 'المشاريع الخضراء',  unit: '',     icon: 'fa-solid fa-seedling',     lowerBetter: false },
    { key: 'water_usage',                 ar: 'استهلاك المياه',    unit: 'م³',   icon: 'fa-solid fa-droplet',      lowerBetter: true  },
    { key: 'waste_recycling_percentage',  ar: 'إعادة التدوير',     unit: '%',    icon: 'fa-solid fa-recycle',      lowerBetter: false },
    { key: 'green_score',                 ar: 'مؤشر الأداء',       unit: '/100', icon: 'fa-solid fa-star',         lowerBetter: false },
  ];

  function getVal(inst, key) {
    if (key === 'green_score') return inst[key] != null ? parseFloat(inst[key]) : null;
    return inst.latest?.[key] != null ? parseFloat(inst.latest[key]) : null;
  }

  async function loadInstitutions() {
    try {
      const data = await apiFetch('/api/institution-names');
      ['compareA', 'compareB'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = data.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
      });
      if (data.length > 1) document.getElementById('compareB').selectedIndex = 1;
    } catch (err) {
      Toast.show('خطأ في تحميل المؤسسات: ' + err.message, 'error');
    }
  }

  async function load() {
    const a = document.getElementById('compareA')?.value;
    const b = document.getElementById('compareB')?.value;
    if (!a || !b || a === b) { Toast.show('اختر مؤسستين مختلفتين', 'warning'); return; }

    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('show');
    try {
      const data = await apiFetch(`/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
      if (data.error) { Toast.show(data.error, 'warning'); return; }
      _lastData  = data;
      _chartType = 'radar';
      document.querySelectorAll('.cmp-chart-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.type === 'radar');
      });
      const resultsEl = document.getElementById('compareResults');
      resultsEl.style.display = 'block';
      resultsEl.classList.remove('cmp-results-visible');
      void resultsEl.offsetWidth;
      resultsEl.classList.add('cmp-results-visible');
      renderWinnerBanner(data);
      renderCards(data);
      renderMetricsBars(data);
      drawChart(data, 'radar');
    } catch (err) {
      Toast.show('خطأ في المقارنة: ' + err.message, 'error');
    } finally {
      if (overlay) overlay.classList.remove('show');
    }
  }

  // ── شريط الفائز ──
  function renderWinnerBanner(data) {
    const scoreA  = getVal(data.a, 'green_score') || 0;
    const scoreB  = getVal(data.b, 'green_score') || 0;
    const banner  = document.getElementById('cmpWinnerBanner');
    const titleEl = document.getElementById('cmpWinnerTitle');
    const subEl   = document.getElementById('cmpWinnerSub');
    if (!banner) return;
    if (scoreA === scoreB) {
      banner.className = 'cmp-winner-banner tie';
      titleEl.textContent = 'تعادل! كلا المؤسستين متكافئتان';
      subEl.textContent   = `بمؤشر أداء ${scoreA.toFixed(1)}/100`;
    } else {
      const winner   = scoreA > scoreB ? data.a : data.b;
      const winScore = Math.max(scoreA, scoreB);
      banner.className = 'cmp-winner-banner win';
      titleEl.textContent = escHtml(winner.name);
      subEl.textContent   = `مؤشر الأداء البيئي: ${winScore.toFixed(1)} / 100`;
    }
  }

  // ── بطاقتا المؤسستين ──
  function renderCards(data) {
    const scoreA = getVal(data.a, 'green_score') || 0;
    const scoreB = getVal(data.b, 'green_score') || 0;

    ['a', 'b'].forEach((side, idx) => {
      const card   = document.getElementById(`card${side.toUpperCase()}`);
      if (!card) return;
      const inst   = data[side];
      const vsInst = data[side === 'a' ? 'b' : 'a'];
      const grad   = idx === 0
        ? 'linear-gradient(135deg,#2e9e5e,#1a7a45)'
        : 'linear-gradient(135deg,#0288d1,#01579b)';
      const color  = idx === 0 ? 'var(--primary)' : 'var(--info)';
      const mySc   = idx === 0 ? scoreA : scoreB;
      const isWinner = (idx === 0 && scoreA > scoreB) || (idx === 1 && scoreB > scoreA);
      const isTie    = scoreA === scoreB;
      const scoreColor = mySc >= 70 ? '#34d399' : mySc >= 40 ? '#f59e0b' : '#ef4444';
      const scoreDisplay = mySc > 0 ? mySc.toFixed(1) : '–';
      const circPerim   = Math.round(2 * Math.PI * 26);                  // ≈163
      const circFill    = Math.round((mySc / 100) * circPerim);

      const metricsHtml = METRICS.filter(m => m.key !== 'green_score').map(m => {
        const val  = getVal(inst, m.key);
        const vval = getVal(vsInst, m.key);
        let badge = '';
        if (val !== null && vval !== null) {
          const better = m.lowerBetter ? val < vval : val > vval;
          const equal  = val === vval;
          badge = equal ? '' : better
            ? `<span class="cmp-metric-badge better"><i class="fa-solid fa-arrow-up"></i> أفضل</span>`
            : `<span class="cmp-metric-badge worse"><i class="fa-solid fa-arrow-down"></i> أدنى</span>`;
        }
        return `
          <div class="cmp-card-metric">
            <div class="cmp-card-metric-icon" style="color:${color}"><i class="${m.icon}"></i></div>
            <div class="cmp-card-metric-info">
              <div class="cmp-card-metric-label">${m.ar}</div>
              <div class="cmp-card-metric-value">${val != null ? formatNumber(val) : '–'} <small>${m.unit}</small></div>
            </div>
            ${badge}
          </div>`;
      }).join('');

      card.className = 'compare-card' + (isWinner && !isTie ? ' winner' : '');
      card.innerHTML = `
        <div class="cmp-card-header" style="background:${grad}">
          <div class="cmp-score-ring">
            <svg viewBox="0 0 64 64" class="cmp-ring-svg">
              <circle cx="32" cy="32" r="26" class="cmp-ring-bg"/>
              <circle cx="32" cy="32" r="26" class="cmp-ring-fill"
                style="stroke:${scoreColor};stroke-dasharray:0 ${circPerim}"
                data-fill="${circFill}" data-perim="${circPerim}"/>
            </svg>
            <div class="cmp-ring-val">${scoreDisplay}</div>
          </div>
          <div class="cmp-card-text">
            <div class="cmp-card-name">${escHtml(inst.name)}</div>
            <div class="cmp-card-year">${inst.latest?.year ? 'بيانات سنة ' + inst.latest.year : 'بدون بيانات'}</div>
          </div>
          ${isWinner && !isTie ? '<div class="cmp-trophy-badge"><i class="fa-solid fa-trophy"></i></div>' : ''}
        </div>
        <div class="cmp-card-body">${metricsHtml}</div>`;
    });

    // تحريك أقواس النتيجة بعد رسمها
    requestAnimationFrame(() => {
      document.querySelectorAll('.cmp-ring-fill').forEach(circle => {
        setTimeout(() => {
          const fill  = circle.dataset.fill;
          const perim = circle.dataset.perim;
          circle.style.strokeDasharray = `${fill} ${perim}`;
        }, 300);
      });
    });
  }

  // ── أشرطة المقارنة التفصيلية ──
  function renderMetricsBars(data) {
    const el = document.getElementById('cmpMetricsBody');
    if (!el) return;
    el.innerHTML = METRICS.filter(m => m.key !== 'green_score').map(m => {
      const vA = getVal(data.a, m.key);
      const vB = getVal(data.b, m.key);
      if (vA === null && vB === null) return '';
      const max    = Math.max(vA || 0, vB || 0) || 1;
      const pA     = Math.round(((vA || 0) / max) * 100);
      const pB     = Math.round(((vB || 0) / max) * 100);
      const betterA = m.lowerBetter ? vA < vB : vA > vB;
      const betterB = m.lowerBetter ? vB < vA : vB > vA;
      return `
        <div class="cmp-metric-row">
          <div class="cmp-metric-label-row">
            <i class="${m.icon}" style="color:var(--primary)"></i>
            <span>${m.ar}</span>
            <span class="cmp-metric-unit">${m.unit}</span>
          </div>
          <div class="cmp-bars-wrap">
            <div class="cmp-bar-side">
              <div class="cmp-bar-label">${escHtml(data.a.name)}</div>
              <div class="cmp-bar-track">
                <div class="cmp-bar-fill green${betterA ? ' winner-bar' : ''}"
                     style="width:0%" data-target="${pA}%"></div>
              </div>
              <div class="cmp-bar-val${betterA ? ' better' : ''}">${vA != null ? formatNumber(vA) : '–'}</div>
            </div>
            <div class="cmp-bar-side">
              <div class="cmp-bar-label">${escHtml(data.b.name)}</div>
              <div class="cmp-bar-track">
                <div class="cmp-bar-fill blue${betterB ? ' winner-bar' : ''}"
                     style="width:0%" data-target="${pB}%"></div>
              </div>
              <div class="cmp-bar-val${betterB ? ' better' : ''}">${vB != null ? formatNumber(vB) : '–'}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    // تحريك أشرطة التقدم
    requestAnimationFrame(() => {
      el.querySelectorAll('.cmp-bar-fill').forEach(bar => {
        setTimeout(() => { bar.style.width = bar.dataset.target; }, 150);
      });
    });
  }

  // ── الرسم البياني ──
  function drawChart(data, type) {
    if (cmpChart) { cmpChart.destroy(); cmpChart = null; }
    const ctx = document.getElementById('compareChart');
    if (!ctx) return;
    const keys   = METRICS.filter(m => m.key !== 'green_score').map(m => m.key);
    const labels = METRICS.filter(m => m.key !== 'green_score').map(m => m.ar);
    const norm   = (k, v) => {
      if (k === 'carbon_emissions' || k === 'energy_consumption') return Math.log10(parseFloat(v || 1) + 1) * 25;
      return parseFloat(v || 0);
    };
    const dA = keys.map(k => norm(k, getVal(data.a, k)));
    const dB = keys.map(k => norm(k, getVal(data.b, k)));
    const ff  = 'Cairo, Segoe UI, sans-serif';
    const datasets = [
      {
        label: data.a.name, data: dA,
        borderColor: 'rgba(46,158,94,1)',
        backgroundColor: type === 'radar' ? 'rgba(46,158,94,.2)' : 'rgba(46,158,94,.85)',
        borderWidth: 2, borderRadius: type === 'bar' ? 6 : 0,
        pointRadius: type === 'radar' ? 5 : 0,
        pointHoverRadius: type === 'radar' ? 7 : 0,
      },
      {
        label: data.b.name, data: dB,
        borderColor: 'rgba(2,136,209,1)',
        backgroundColor: type === 'radar' ? 'rgba(2,136,209,.2)' : 'rgba(2,136,209,.85)',
        borderWidth: 2, borderRadius: type === 'bar' ? 6 : 0,
        pointRadius: type === 'radar' ? 5 : 0,
        pointHoverRadius: type === 'radar' ? 7 : 0,
      },
    ];
    const options = type === 'radar' ? {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 750, easing: 'easeOutQuart' },
      plugins: { legend: { labels: { font: { family: ff, size: 12 } } } },
      scales: {
        r: {
          ticks: { font: { family: ff, size: 10 }, backdropColor: 'transparent' },
          pointLabels: { font: { family: ff, size: 11 } },
        },
      },
    } : {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 750, easing: 'easeOutQuart' },
      plugins: { legend: { labels: { font: { family: ff, size: 12 } } } },
      scales: {
        x: { ticks: { font: { family: ff, size: 11 } }, grid: { display: false } },
        y: { ticks: { font: { family: ff, size: 10 } }, beginAtZero: true },
      },
    };
    cmpChart = new Chart(ctx, { type, data: { labels, datasets }, options });
  }

  function switchChart(type) {
    if (!_lastData) return;
    _chartType = type;
    document.querySelectorAll('.cmp-chart-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.type === type);
    });
    drawChart(_lastData, type);
  }

  function init() { loadInstitutions(); }

  return { init, load, switchChart };
})();

// ══════════════════════════════════════════════════════════════════════════════
// استيراد CSV – CSV Import
// ══════════════════════════════════════════════════════════════════════════════
const CsvImport = (() => {
  async function importFile(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('show');
    try {
      const res = await fetch('/api/import-csv', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      Toast.show(data.message || 'تم الاستيراد بنجاح', 'success');
      if (data.errors && data.errors.length) {
        data.errors.forEach(e => Toast.show(e, 'warning', 6000));
      }
      if (typeof DataEntryPage !== 'undefined') DataEntryPage.loadTable(1);
      SettingsPage.refreshSystemInfo?.();
    } catch (err) {
      Toast.show('خطأ في الاستيراد: ' + err.message, 'error');
    } finally {
      if (overlay) overlay.classList.remove('show');
    }
  }

  function init() {
    const dropArea = document.getElementById('csvDropArea');
    const fileInput = document.getElementById('csvFileInput');
    if (!dropArea || !fileInput) return;

    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => importFile(e.target.files[0]));

    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('dragover'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', e => {
      e.preventDefault();
      dropArea.classList.remove('dragover');
      importFile(e.dataTransfer.files[0]);
    });
  }

  return { init };
})();

// ══════════════════════════════════════════════════════════════════════════════
// الإعدادات – Settings
// ══════════════════════════════════════════════════════════════════════════════
const SettingsPage = (() => {

  // ── التبويبات ──
  function switchTab(tabId) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.settings-tab[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(`panel-${tabId}`)?.classList.add('active');
  }

  // ── تحميل الإعدادات من الخادم ──
  async function load() {
    try {
      const data = await apiFetch('/api/settings');

      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
      setVal('settingSystemName',      data.system_name      || 'نظام متابعة الاقتصاد الأخضر');
      setVal('settingCarbonThreshold', data.carbon_threshold || '1000');
      setVal('settingDefaultLang',     data.default_lang     || 'ar');
      setVal('settingDefaultTheme',    data.default_theme    || 'light');
      setVal('settingMailServer',      data.mail_server      || 'smtp.gmail.com');
      setVal('settingMailPort',        data.mail_port        || '587');
      setVal('settingMailUser',        data.mail_username    || '');
      setVal('settingMailTo',          data.mail_to          || '');

      const mailToggle = document.getElementById('settingMailEnabled');
      if (mailToggle) mailToggle.checked = data.mail_enabled === 'true';

      // معلومات النظام (قراءة فقط)
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '–'; };
      setTxt('sysPythonVersion',    data._sys_python_version);
      setTxt('sysFlaskVersion',     data._sys_flask_version);
      setTxt('sysDbType',           data._sys_db_type);
      setTxt('sysDbSize',           data._sys_db_size);
      setTxt('sysTotalInstitutions',data._sys_total_institutions);

    } catch (err) {
      Toast.show('خطأ في تحميل الإعدادات: ' + err.message, 'error');
    }
  }

  async function refreshSystemInfo() {
    try {
      const data = await apiFetch('/api/settings');
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '–'; };
      setTxt('sysPythonVersion',     data._sys_python_version);
      setTxt('sysFlaskVersion',      data._sys_flask_version);
      setTxt('sysDbType',            data._sys_db_type);
      setTxt('sysDbSize',            data._sys_db_size);
      setTxt('sysTotalInstitutions', data._sys_total_institutions);
    } catch (err) {
      // لا نعرض خطأ هنا لأن التحديث الخلفي غير حرج
    }
  }

  // ── حفظ الإعدادات العامة ──
 async function saveGeneral() {
  const payload = {
    system_name:       document.getElementById('settingSystemName')?.value?.trim(),
    carbon_threshold:  document.getElementById('settingCarbonThreshold')?.value,
    default_lang:      document.getElementById('settingDefaultLang')?.value,
    default_theme:     document.getElementById('settingDefaultTheme')?.value,
  };

  try {
    await apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(payload) });

    // 🟢 إخفاء الصفحة لحظة (يمنع الرمشة)
    document.body.style.opacity = "0";

    setTimeout(() => {

      // 🟢 تطبيق اللغة
      if (typeof I18n !== "undefined") {
        I18n.setLang(payload.default_lang);
      }

      // 🟢 تطبيق الثيم
      if (typeof ThemeManager !== "undefined") {
        ThemeManager.setTheme(payload.default_theme);
      }

      // 🟢 حفظ محلي
      localStorage.setItem("lang", payload.default_lang);
      localStorage.setItem("theme", payload.default_theme);

      // 🟢 إظهار الصفحة تاني
      document.body.style.opacity = "1";

      // 🟢 رسالة النجاح
      Toast.show('تم حفظ الإعدادات العامة بنجاح', 'success');

    }, 100);

  } catch (err) {
    Toast.show('خطأ: ' + err.message, 'error');
  }
}
  // ── حفظ إعدادات البريد ──
  async function saveMail() {
    const payload = {
      mail_enabled:  document.getElementById('settingMailEnabled')?.checked ? 'true' : 'false',
      mail_server:   document.getElementById('settingMailServer')?.value?.trim(),
      mail_port:     document.getElementById('settingMailPort')?.value,
      mail_username: document.getElementById('settingMailUser')?.value?.trim(),
      mail_to:       document.getElementById('settingMailTo')?.value?.trim(),
    };
    try {
      await apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
      Toast.show('تم حفظ إعدادات البريد بنجاح', 'success');
    } catch (err) {
      Toast.show('خطأ: ' + err.message, 'error');
    }
  }

  // ── تغيير كلمة المرور ──
  async function changePassword() {
    const current = document.getElementById('currentPassword')?.value;
    const newPwd  = document.getElementById('newPassword')?.value;
    const confirm = document.getElementById('confirmPassword')?.value;

    if (!current || !newPwd || !confirm) { Toast.show('يرجى تعبئة جميع الحقول', 'warning'); return; }
    if (newPwd !== confirm) { Toast.show('كلمة المرور الجديدة غير متطابقة', 'warning'); return; }
    if (newPwd.length < 6) { Toast.show('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning'); return; }

    try {
      await apiFetch('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: newPwd }),
      });
      Toast.show('تم تغيير كلمة المرور بنجاح', 'success');
      ['currentPassword', 'newPassword', 'confirmPassword'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
    } catch (err) {
      Toast.show('خطأ: ' + err.message, 'error');
    }
  }

  // ── تحميل قائمة المستخدمين ──
  async function loadUsers() {
    const container = document.getElementById('usersList');
    if (!container) return;
    try {
      const users = await apiFetch('/api/users');
      const roleLabels = {admin: 'مدير', user: 'مستخدم', viewer: 'مشاهد'};
      const roleColors = {admin: 'badge-red', user: 'badge-green', viewer: 'badge-blue'};
      container.innerHTML = users.map(u => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border)">
          <div class="user-avatar" style="width:32px;height:32px;font-size:.9rem;flex-shrink:0"><i class="fa-solid fa-user"></i></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.9rem">${escHtml(u.username)} <span class="badge ${roleColors[u.role] || 'badge-blue'}" style="font-size:.7rem">${roleLabels[u.role] || u.role}</span></div>
            <div style="font-size:.75rem;color:var(--text-muted)">${u.created_at || ''}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="SettingsPage.deleteUser(${u.id}, '${escHtml(u.username)}')" title="حذف المستخدم">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>`).join('') || '<p style="color:var(--text-muted);text-align:center;padding:1rem">لا يوجد مستخدمون</p>';
    } catch (err) {
      Toast.show('خطأ في تحميل المستخدمين: ' + err.message, 'error');
    }
  }

  // ── إضافة مستخدم ──
  async function addUser() {
    const username = document.getElementById('newUsername')?.value?.trim();
    const password = document.getElementById('newUserPassword')?.value?.trim();
    const role     = document.getElementById('newUserRole')?.value || 'viewer';
    if (!username || !password) { Toast.show('أدخل اسم المستخدم وكلمة المرور', 'warning'); return; }
    try {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      Toast.show(`تم إضافة المستخدم ${username} بنجاح`, 'success');
      document.getElementById('newUsername').value = '';
      document.getElementById('newUserPassword').value = '';
      if (document.getElementById('newUserRole')) document.getElementById('newUserRole').value = 'viewer';
      loadUsers();
    } catch (err) {
      Toast.show('خطأ: ' + err.message, 'error');
    }
  }

  // ── حذف مستخدم ──
  async function deleteUser(id, name) {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${name}"؟`)) return;
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      Toast.show('تم حذف المستخدم بنجاح', 'success');
      loadUsers();
    } catch (err) {
      Toast.show('خطأ: ' + err.message, 'error');
    }
  }

  // ── تحميل سجل التدقيق ──
  async function loadAuditLog() {
    const tbody = document.getElementById('auditLogBody');
    if (!tbody) return;
    try {
      const logs = await apiFetch('/api/audit-log?limit=100');
      tbody.innerHTML = logs.length
        ? logs.map(l => `
          <tr>
            <td style="white-space:nowrap;font-size:.8rem">${escHtml(l.created_at || '')}</td>
            <td><strong>${escHtml(l.username)}</strong></td>
            <td><span class="badge badge-green">${escHtml(l.action)}</span></td>
            <td style="font-size:.85rem">${escHtml(l.details || '')}</td>
          </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">لا توجد سجلات</td></tr>`;
    } catch (err) {
      Toast.show('خطأ في تحميل السجل: ' + err.message, 'error');
    }
  }

  function init() {
    load();
    document.querySelectorAll('.settings-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
        if (btn.dataset.tab === 'users') loadUsers();
        if (btn.dataset.tab === 'audit') loadAuditLog();
      });
    });
  }

  // ── إنشاء نسخة احتياطية ──
  function createBackup() {
    Toast.show('جارٍ إنشاء النسخة الاحتياطية...', 'info');
    const a = document.createElement('a');
    a.href = '/api/backup';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => Toast.show('تم بدء تحميل النسخة الاحتياطية', 'success'), 1000);
  }

  // ── حذف جميع البيانات ──
  async function deleteAllData() {
    const first = confirm('⚠ هل أنت متأكد من حذف جميع بيانات المؤسسات؟\nهذه العملية لا يمكن التراجع عنها!');
    if (!first) return;
    const second = confirm('⚠⚠ تأكيد نهائي: سيتم حذف كل السجلات بشكل دائم.\nهل تريد المتابعة؟');
    if (!second) return;
    try {
      const res = await apiFetch('/api/delete-all-data?confirm=yes', { method: 'DELETE' });
      Toast.show(res.message, 'success');
      SettingsPage.refreshSystemInfo?.();
    } catch (err) {
      Toast.show('خطأ: ' + err.message, 'error');
    }
  }

  // ── استعادة نسخة احتياطية ──
  async function restoreBackup() {
    const input = document.getElementById('restoreFileInput');
    const file = input?.files?.[0];
    if (!file) return;

    const nameEl = document.getElementById('restoreFileName');
    if (nameEl) nameEl.textContent = file.name;

    if (!file.name.endsWith('.db')) {
      Toast.show('يجب اختيار ملف بصيغة .db', 'warning');
      input.value = '';
      return;
    }

    if (!confirm('⚠ سيتم استبدال قاعدة البيانات الحالية بالنسخة الاحتياطية.\n(سيتم حفظ نسخة من القاعدة الحالية تلقائياً)\n\nهل تريد المتابعة؟')) {
      input.value = '';
      if (nameEl) nameEl.textContent = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      Toast.show('جارٍ استعادة النسخة الاحتياطية...', 'info');
      const resp = await fetch('/api/restore-backup', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'خطأ غير متوقع');
      Toast.show(data.message, 'success', 6000);
      SettingsPage.refreshSystemInfo?.();
      setTimeout(() => location.reload(), 2000);
    } catch (err) {
      Toast.show('خطأ: ' + err.message, 'error');
    } finally {
      input.value = '';
    }
  }

  return { init, saveGeneral, saveMail, changePassword, addUser, deleteUser, loadUsers, loadAuditLog, createBackup, deleteAllData, restoreBackup, refreshSystemInfo };
})();

// ══════════════════════════════════════════════════════════════════════════════
// الإشعارات والتنبيهات – Notifications
// ══════════════════════════════════════════════════════════════════════════════
const NotificationsPage = (() => {
  const t = (key, fallback = '') => I18n.t(key) === key ? fallback : I18n.t(key);

  function mapActionLabel(action) {
    const keyMap = {
      'إضافة مؤسسة': 'actions.addInstitution',
      'تعديل مؤسسة': 'actions.editInstitution',
      'حذف مؤسسة': 'actions.deleteInstitution',
      'استيراد بيانات': 'actions.importData',
      'إضافة مستخدم': 'actions.addUser',
      'حذف مستخدم': 'actions.deleteUser',
      'Add Institution': 'actions.addInstitution',
      'Edit Institution': 'actions.editInstitution',
      'Delete Institution': 'actions.deleteInstitution',
      'Import Data': 'actions.importData',
      'Add User': 'actions.addUser',
      'Delete User': 'actions.deleteUser',
    };
    const key = keyMap[action];
    return key ? t(key, action) : action;
  }

  async function init() {
    try {
      const data = await apiFetch('/api/notifications');
      renderSummary(data);
      renderCarbonAlerts(data.alerts || [], data.carbon_threshold);
      renderTopRenewable(data.top_renewable || []);
      renderActivityLog(data.activities || []);
      updateNotifBadge(data.high_carbon_count || 0);
    } catch (err) {
      Toast.show(`${t('notifications.loadError', 'خطأ في تحميل الإشعارات')}: ${err.message}`, 'error');
    }
  }

  function renderSummary(data) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('nsAlerts',    data.high_carbon_count || 0);
    set('nsRecords',   data.total_records    || 0);
    set('nsYear',      data.latest_year      || '–');
    set('nsThreshold', data.carbon_threshold || '–');
    set('alertsCountBadge', `${data.high_carbon_count || 0} ${t('notifications.alertCount', 'تنبيه')}`);

    const badge = document.getElementById('alertsCountBadge');
    if (badge) {
      badge.className = 'notif-count-badge ' + (data.high_carbon_count > 0 ? 'danger' : 'success');
    }
  }

  function renderCarbonAlerts(alerts, threshold) {
    const el = document.getElementById('carbonAlertsContainer');
    if (!el) return;
    if (!alerts.length) {
      el.innerHTML = `<div class="notif-empty"><i class="fa-solid fa-check-circle"></i><p>${t('notifications.noneExceeded', 'ممتاز! لا توجد انبعاثات تتجاوز حد الكربون')} (${threshold} ${t('unit.ton', 'طن')})</p></div>`;
      return;
    }
    el.innerHTML = alerts.map(a => `
      <div class="notif-alert-item ${a.type}">
        <div class="notif-alert-icon">
          <i class="fa-solid ${a.type === 'danger' ? 'fa-triangle-exclamation' : 'fa-exclamation-circle'}"></i>
        </div>
        <div class="notif-alert-body">
          <div class="notif-alert-title">${escHtml(a.name)} – ${a.year}</div>
          <div class="notif-alert-msg">
            ${t('notifications.carbonLabel', 'انبعاثات الكربون')}: <strong>${formatNumber(a.carbon)} ${t('unit.ton', 'طن')}</strong>
            (${t('notifications.exceededBy', 'تجاوز بنسبة')} <strong style="color:var(--danger)">${a.excess_pct}%</strong> ${t('notifications.aboveLimit', 'فوق الحد المسموح')})
          </div>
          <div class="notif-alert-meta">
            <span><i class="fa-solid fa-recycle"></i> ${t('notifications.renewable', 'طاقة متجددة')}: ${a.renewable}%</span>
            <span><i class="fa-solid fa-gauge-high"></i> ${t('notifications.limit', 'الحد')}: ${formatNumber(threshold)} ${t('unit.ton', 'طن')}</span>
          </div>
        </div>
        <div class="notif-alert-badge ${a.type}">${a.type === 'danger' ? t('notifications.danger', 'خطر') : t('notifications.warning', 'تحذير')}</div>
      </div>`).join('');
  }

  function renderTopRenewable(top) {
    const el = document.getElementById('topRenewableContainer');
    if (!el) return;
    if (!top.length) {
      el.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:2rem">${t('notifications.empty', 'لا توجد بيانات')}</p>`;
      return;
    }
    el.innerHTML = top.map((r, i) => `
      <div class="notif-renew-item">
        <div class="notif-renew-rank">${i + 1}</div>
        <div class="notif-renew-info">
          <div class="notif-renew-name">${escHtml(r.name)}</div>
          <div class="notif-renew-bar-wrap">
            <div class="notif-renew-bar" style="width:${Math.min(100, r.renewable_energy_percentage)}%"></div>
          </div>
        </div>
        <div class="notif-renew-pct">${parseFloat(r.renewable_energy_percentage).toFixed(1)}%</div>
      </div>`).join('');
  }

  function renderActivityLog(activities) {
    const el = document.getElementById('activityLogContainer');
    if (!el) return;
    if (!activities.length) {
      el.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:2rem">${t('notifications.emptyLogs', 'لا توجد نشاطات مسجلة')}</p>`;
      return;
    }
    const icons = {
      'إضافة مؤسسة':   'fa-solid fa-plus-circle',
      'تعديل مؤسسة':   'fa-solid fa-pen-to-square',
      'حذف مؤسسة':     'fa-solid fa-trash',
      'استيراد بيانات':'fa-solid fa-file-arrow-up',
      'إضافة مستخدم':  'fa-solid fa-user-plus',
      'حذف مستخدم':    'fa-solid fa-user-minus',
    };
    const typeColor = {
      'إضافة مؤسسة':   'success',
      'تعديل مؤسسة':   'info',
      'حذف مؤسسة':     'danger',
      'استيراد بيانات':'warning',
      'إضافة مستخدم':  'success',
      'حذف مستخدم':    'danger',
    };
    el.innerHTML = activities.map(a => `
      <div class="notif-activity-item">
        <div class="notif-activity-icon ${typeColor[a.action] || 'info'}">
          <i class="${icons[a.action] || 'fa-solid fa-circle-dot'}"></i>
        </div>
        <div class="notif-activity-info">
          <div class="notif-activity-action">${escHtml(mapActionLabel(a.action))}</div>
          <div class="notif-activity-detail">${escHtml(a.details || '–')} · <span class="notif-activity-user">@${escHtml(a.username)}</span></div>
        </div>
        <div class="notif-activity-time">${escHtml(a.created_at ? a.created_at.slice(0, 16).replace('T', ' ') : '')}</div>
      </div>`).join('');
  }

  return { init };
})();

// ── تهيئة الصفحة الحالية ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  I18n.init();

  // ── Hamburger / Sidebar toggle للموبايل ──
  (function initSidebar() {
    const btn     = document.getElementById('hamburgerBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!btn || !sidebar) return;

    function openSidebar() {
      sidebar.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (overlay) overlay.classList.add('show');
    }
    function closeSidebar() {
      sidebar.classList.remove('open');
      document.body.style.overflow = '';
      if (overlay) overlay.classList.remove('show');
    }

    btn.addEventListener('click', () => {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // إغلاق الـ sidebar عند الضغط على أي رابط بالداخل (للموبايل)
    sidebar.querySelectorAll('.nav-item').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });
  })();

  const page = document.body.dataset.page;
  if (page === 'dashboard') {
    DashboardPage.init();
    // Drag & Drop – يُفعَّل فقط إذا كانت SortableJS محمَّلة
    if (typeof Sortable !== 'undefined') {
      const grid = document.querySelector('.stats-grid');
      if (grid) new Sortable(grid, { animation: 150, ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen' });
    }
  }
  if (page === 'data-entry') {
    DataEntryPage.init();
    CsvImport.init();
  }
  if (page === 'reports')       ReportsPage.init();
  if (page === 'green-score')   GreenScorePage.init();
  if (page === 'predictions')   PredictionsPage.init();
  if (page === 'compare')       ComparePage.init();
  if (page === 'settings')      SettingsPage.init();
  if (page === 'notifications') NotificationsPage.init();

  // تصدير CSV
  document.getElementById('exportCsvBtn')?.addEventListener('click', ReportsPage.exportCSV);
  // تصدير PDF
  document.getElementById('exportPdfBtn')?.addEventListener('click', () => {
    window.location.href = '/api/export-pdf';
    Toast.show('جارٍ تحضير ملف PDF...', 'info');
  });
  // تصدير Excel
  document.getElementById('exportExcelBtn')?.addEventListener('click', ReportsPage.exportExcel);
});

