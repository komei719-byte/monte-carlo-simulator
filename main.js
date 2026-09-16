// Chart.js のインスタンス保持用変数
let myChart = null;

// 1. ボックス＝ミュラー法による標準正規乱数生成器
function generateNormalRandom() {
  let u1 = Math.random();
  let u2 = Math.random();
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// 2. モンテカルロシミュレーションのメイン処理
function runMonteCarlo(params) {
  const {
    initialCapital, years, simulations,
    tqqqRatio, goldRatio,
    tqqqReturn, tqqqRisk,
    goldReturn, goldRisk,
    correlation,
    isArithmeticReturn // 算術平均リターンかどうかのフラグ
  } = params;

  // フォームから選択値を取得
const isArithmetic = document.querySelector('input[name="returnType"]:checked').value === 'arithmetic';

// 幾何ブラウン運動のドリフト項計算
// 算術平均なら -0.5 * σ² の調整を行い、幾何平均(CAGR)ならそのまま使用する
const driftTqqq = isArithmetic 
  ? (tqqqReturn - 0.5 * Math.pow(tqqqRisk, 2)) 
  : tqqqReturn;

const driftGold = isArithmetic 
  ? (goldReturn - 0.5 * Math.pow(goldRisk, 2)) 
  : goldReturn;

  // 0年目は全試行で初期資金
  for (let i = 0; i < simulations; i++) {
    yearlyResults[0].push(initialCapital);
  }

  // 相関係数の範囲チェック (-1 <= rho <= 1)
  const rho = Math.max(-1, Math.min(1, correlation));
  const rhoScale = Math.sqrt(1 - rho * rho);

  // シミュレーション実行
  for (let sim = 0; sim < simulations; sim++) {
    let currentTqqq = initialCapital * tqqqRatio;
    let currentGold = initialCapital * goldRatio;

    for (let year = 1; year <= years; year++) {
      // 2つの独立な標準正規乱数を発生
      const z1 = generateNormalRandom();
      const z2 = generateNormalRandom();

      // 2変量正規乱数の生成
      const zTqqq = z1;
      const zGold = rho * z1 + rhoScale * z2;

      // 1年後の資産額を計算 (対数正規分布モデル)
      const rTqqq = driftTqqq + tqqqRisk * zTqqq;
      const rGold = driftGold + goldRisk * zGold;

      currentTqqq *= Math.exp(rTqqq);
      currentGold *= Math.exp(rGold);

      // 合計資産額
      const totalPortfolio = currentTqqq + currentGold;
      yearlyResults[year].push(totalPortfolio);

      // 【年1回のリバランス】次年に向けて初期設定比率に再配分
      currentTqqq = totalPortfolio * tqqqRatio;
      currentGold = totalPortfolio * goldRatio;
    }
  }

  return yearlyResults;
}

// 3. パーセンタイル（10%, 50%, 90%）の集計計算
function calculatePercentiles(yearlyResults, years) {
  const medians = [];
  const top10s = [];
  const bottom10s = [];

  for (let year = 0; year <= years; year++) {
    // 数値の昇降順ソート
    const sorted = [...yearlyResults[year]].sort((a, b) => a - b);
    const count = sorted.length;

    bottom10s.push(sorted[Math.floor(count * 0.1)]);
    medians.push(sorted[Math.floor(count * 0.5)]);
    top10s.push(sorted[Math.floor(count * 0.9)]);
  }

  return { medians, top10s, bottom10s };
}

// 4. Chart.js によるグラフ描画
function renderChart(years, percentiles) {
  const ctx = document.getElementById('simChart').getContext('2d');
  const labels = Array.from({ length: years + 1 }, (_, i) => `${i}年目`);

  if (myChart) {
    myChart.destroy();
  }

  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '上位 10% (好調)',
          data: percentiles.top10s,
          borderColor: 'rgba(40, 167, 69, 1)',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          borderDash: [5, 5],
          fill: false
        },
        {
          label: '中央値 (50%)',
          data: percentiles.medians,
          borderColor: 'rgba(0, 102, 204, 1)',
          backgroundColor: 'rgba(0, 102, 204, 0.2)',
          borderWidth: 3,
          fill: false
        },
        {
          label: '下位 10% (不調)',
          data: percentiles.bottom10s,
          borderColor: 'rgba(220, 53, 69, 1)',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          borderDash: [5, 5],
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        y: {
          title: { display: true, text: '資産額 ($)' },
          ticks: {
            callback: value => '$' + Math.round(value).toLocaleString()
          }
        },
        x: {
          title: { display: true, text: '経過年数' }
        }
      }
    }
  });
}

// 5. フォーム送信時のメインイベントハンドラ
document.getElementById('sim-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const initialCapital = parseFloat(document.getElementById('initialCapital').value);
  const years = parseInt(document.getElementById('years').value);
  const simulations = parseInt(document.getElementById('simulations').value);

  let rawTqqqRatio = parseFloat(document.getElementById('tqqqRatio').value);
  let rawGoldRatio = parseFloat(document.getElementById('goldRatio').value);

  // 比率の自動標準化 (合計が100%になるよう補正、またはCash枠の考慮)
  const totalRatio = rawTqqqRatio + rawGoldRatio;
  if (totalRatio === 0) {
    alert("アセットの比率を入力してください。");
    return;
  }

  const tqqqRatio = rawTqqqRatio / totalRatio;
  const goldRatio = rawGoldRatio / totalRatio;

  const params = {
    initialCapital,
    years,
    simulations,
    tqqqRatio,
    goldRatio,
    tqqqReturn: parseFloat(document.getElementById('tqqqReturn').value) / 100,
    tqqqRisk: parseFloat(document.getElementById('tqqqRisk').value) / 100,
    goldReturn: parseFloat(document.getElementById('goldReturn').value) / 100,
    goldRisk: parseFloat(document.getElementById('goldRisk').value) / 100,
    correlation: parseFloat(document.getElementById('correlation').value),
    isArithmeticReturn: true // 一般的な期待リターン（算術平均）を入力前提とする場合はtrue
  };

  // 計算実行
  const yearlyResults = runMonteCarlo(params);
  const percentiles = calculatePercentiles(yearlyResults, years);

  // サマリー指標の更新
  const finalYearResults = yearlyResults[years];
  const finalMedian = percentiles.medians[years];
  const finalTop10 = percentiles.top10s[years];
  const finalBottom10 = percentiles.bottom10s[years];

  const lossCount = finalYearResults.filter(v => v < initialCapital).length;
  const lossProb = ((lossCount / simulations) * 100).toFixed(1);

  document.getElementById('median-val').innerText = `$${Math.round(finalMedian).toLocaleString()}`;
  document.getElementById('top10-val').innerText = `$${Math.round(finalTop10).toLocaleString()}`;
  document.getElementById('bottom10-val').innerText = `$${Math.round(finalBottom10).toLocaleString()}`;
  document.getElementById('loss-prob').innerText = `${lossProb}%`;

  // グラフ描画
  renderChart(years, percentiles);
});