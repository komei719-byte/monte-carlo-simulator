document.getElementById('sim-form').addEventListener('submit', function(e) {
  e.preventDefault(); // ページリロードを防止

  // 入力値を取得
  const capital = parseFloat(document.getElementById('initialCapital').value);
  const years = parseInt(document.getElementById('years').value);
  const sims = parseInt(document.getElementById('simulations').value);

  console.log(`初期資金: $${capital}, 運用期間: ${years}年, 試行回数: ${sims}回`);
  alert('パラメータを取得しました。ロジック実装準備完了です！');
});