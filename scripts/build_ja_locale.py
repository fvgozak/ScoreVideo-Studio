#!/usr/bin/env python3
"""Build the Japanese pack from reviewed Japanese strings and safe English fallbacks.

Run after updating English/Korean packs. Overrides are maintained below; untranslated
entries use *English* rather than leaking Korean into the Japanese UI.
"""
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent.parent/'static'/'locales'
ko=json.loads((HERE/'ko.json').read_text(encoding='utf-8'))
en=json.loads((HERE/'en.json').read_text(encoding='utf-8'))

MESSAGES={
'palette.title':'✦ 楽譜のカラーコーディネート',
'palette.themeHelp':'テーマを選ぶか、アルバムジャケットや写真から色を抽出できます。動画の背景は別に設定します。',
'palette.themeLabel':'テーマ · 背景画像なしで色を選択',
'palette.space':'宇宙','palette.sea':'海','palette.forest':'森','palette.wood':'木','palette.themeColors':'テーマの代表色',
'palette.imageColors':'抽出した代表色','background.pattern':'背景パターン',
'nav.file':'ファイル','nav.score':'楽譜','nav.scene':'シーン','nav.background':'背景','nav.effects':'エフェクト',
'nav.export':'書き出し','nav.exportAction':'書き出し','nav.fileHelp':'ファイルの案内',
'nav.sync':'同期','nav.previewTools':'プレビュー操作',
'effects.advanced':'詳細エフェクト設定','effects.presetGroup':'エフェクトプリセット',
'export.previewAspect':'動画の縦横比','export.customAspect':'カスタム','export.outputQhd':'1440p · QHD',
'export.outputUhd':'2160p · 4K UHD','export.videoQuality':'高速エンジンの動画品質',
'export.videoBitrate':'高速エンジンのビットレート',
'effects.trailLength':'軌跡の長さ · 音符数','effects.trailBrightness':'軌跡の明るさ',
'effects.trailThickness':'軌跡の太さ','effects.trailDuration':'軌跡の持続時間',
'common.language':'言語','common.loading':'読み込み中…','common.confirm':'確認','common.cancel':'キャンセル',
'score.zoom':'楽譜の拡大','score.cropTop':'楽譜の上部を切り取る',
'score.cropTopPercent':'楽譜上部の切り取り率',
'score.cropTopHelp':'楽譜の大きさと位置を保ち、表示領域の上部だけを透明に隠します。',
'score.autoLayout':'楽譜の自動配置','score.areaBackground':'楽譜エリアの背景色',
'piano.keyGlow':'打鍵時の発光','effects.minimalMode':'ミニマルモード',
'effects.renderer':'エフェクト描画エンジン','effects.rendererCanvas':'従来の Canvas2D',
'effects.rendererAuto':'自動','effects.rendererPixi':'PixiJS GPU',
'effects.rendererDefault':'使用中: 従来の Canvas2D',
'effects.rendererActive':'使用中: PixiJS GPU','effects.rendererDynamic':'使用中: Dynamic FX v1.6',
'effects.rendererFallback':'GPU 初期化失敗: {reason} · Canvas2D を使用',
'effects.rendererError':'GPU レンダラーエラー: {reason}',
'effects.gpuTitle':'PixiJS ライティング','effects.gpuPreset':'照明プリセット',
'effects.cinematicOn':'Cinematic Effects · GPU 照明','effects.cinematicStrength':'全体の強さ',
'effects.musicReaction':'音楽への反応','effects.presetAurora':'Aurora · 青緑と紫の光',
'effects.presetStarlight':'Starlight · 鮮やかな星明かり',
'effects.presetGoldenHall':'Golden Hall · 暖かな金色の光',
'effects.presetDreamscape':'Dreamscape · 夢幻的な残光',
'effects.presetMinimalNoir':'Minimal Noir · 控えめな光',
'effects.classic':'Classic Glow · 柔らかな後光',
'effects.glowCore':'中心光 · 強さ','effects.glowCoreRadius':'中心光 · 半径',
'effects.glowMid':'中間の光 · 強さ','effects.glowMidRadius':'中間の光 · 半径',
'effects.glowHalo':'広がる光 · 強さ','effects.glowHaloRadius':'広がる光 · 半径',
'effects.bloom':'Soft Bloom · 広がる光','effects.outline':'Outline Light · 輪郭',
'effects.stardust':'Stardust · 打鍵パーティクル',
'effects.volumetric':'Volumetric Light · 指向性の光線',
'effects.chromatic':'Chromatic Aberration · 光の縁の色ずれ',
'effects.gpuTrail':'Light Trails · 旋律の軌跡',
'effects.gpuTrailStrength':'Light Trails · 強さ',
'effects.gpuTrailLength':'Light Trails · 音符数',
'effects.gpuTrailDuration':'Light Trails · 持続時間',
'effects.particleBurst':'Particle Burst · 打鍵パーティクル',
'effects.particleCount':'パーティクル数','effects.particleSize':'パーティクルの大きさ',
'effects.particleSpeed':'パーティクルの速度','effects.particleDirection':'拡散方向',
'effects.particleSpread':'拡散角度','effects.particleLife':'パーティクルの寿命',
'effects.particleBrightness':'パーティクルの明るさ',
'effects.pedalResonance':'Pedal Resonance · ペダルの光の拡散',
'effects.sustainAfterglow':'Sustain Afterglow · 持続音の残光',
'minimal.paletteTitle':'ミニマルカラー','minimal.paletteMode':'配色のおすすめ',
'minimal.single':'Single · 単色','minimal.harmony':'Harmony · 調和',
'minimal.contrast':'Contrast · 背景との対比',
'minimal.velocity':'Velocity Gradient · 強弱グラデーション',
'minimal.note':'符頭','minimal.white':'白鍵','minimal.black':'黒鍵','minimal.pedal':'ペダル表示',
'export.cancel':'レンダリングをキャンセル',
'export.progress':'レンダリング中... {percent}%',
'export.ready':'MP4 を書き出す','background.positionY':'背景の縦位置',
'error.languagePack':'言語パックを読み込めませんでした。'
}

# Common UI phrases used in legacy dynamic DOM generation. Keep these overrides
# directly keyed by the literal Korean source so the backwards-compatible
# MutationObserver can localize existing screens without changing enum values.
from ja_reviewed import REVIEWED

LEGACY={
'파일':'ファイル','악보':'楽譜','장면':'シーン','배경':'背景','효과':'エフェクト','출력':'出力',
'내보내기':'書き出し','파일 불러오기':'ファイルを読み込む','불러오기':'読み込む',
'초기화':'初期化','초기화하기':'初期化する','취소':'キャンセル','확인':'確認',
'저장':'保存','선택':'選択','삭제':'削除','제거':'削除','추가':'追加',
'파일 선택':'ファイルを選択','파일을 선택하세요':'ファイルを選択してください',
'악보 효과':'楽譜エフェクト','건반 효과':'鍵盤エフェクト',
'악보 효과 · Score FX':'楽譜エフェクト · Score FX',
'건반 효과 · Keyboard FX':'鍵盤エフェクト · Keyboard FX',
'악보 효과 · 상세 설정':'楽譜エフェクト · 詳細設定',
'건반 효과 · 상세 설정':'鍵盤エフェクト · 詳細設定',
'고급 설정 · 세부 조정':'詳細設定 · 微調整','고급 효과 설정':'詳細エフェクト設定',
'기본 색상':'基本カラー','자연과 풍경':'自然と風景','시간과 계절':'時間と季節',
'프로젝트 팔레트':'プロジェクトのパレット',
'악보 색상 연동':'楽譜の色に連動',
'우주 · 성운 / 별빛':'宇宙 · 星雲 / 星明かり',
'숲 · 이끼 / 햇살':'森 · 苔 / 木漏れ日',
'나무 · 삼나무 / 황금빛':'木 · 杉 / 黄金色の光',
'바다 · 푸른 물결 / 물보라':'海 · 青い波 / 水しぶき',
'하늘 · 맑은 파랑 / 구름빛':'空 · 青空 / 雲の光',
'심해 · 심해청 / 생물발광':'深海 · 深い青 / 生物発光',
'초원 · 풀잎 / 햇살':'草原 · 草葉 / 陽光',
'달빛 · 남색 / 은빛':'月明かり · 紺色 / 銀色',
'새벽 · 연보라 / 해돋이':'夜明け · 薄紫 / 朝日',
'노을 · 자주 / 주황':'夕焼け · 赤紫 / オレンジ',
'가을 · 단풍 / 금빛':'秋 · 紅葉 / 金色',
'빙하 · 얼음 / 수정빛':'氷河 · 氷 / クリスタル',
'벚꽃 · 분홍 / 꽃잎':'桜 · ピンク / 花びら',
'효과 스타일':'エフェクトスタイル','직접 조정':'手動調整','직접 선택':'手動選択',
'빛 색상':'光の色','선택한 색상 미리보기':'選択した色のプレビュー',
'약한 타건과 강한 타건의 색상을 지정합니다.':'弱い打鍵と強い打鍵の色を設定します。',
'약한 음 → 강한 음으로 색이 변화합니다. 효과 스타일과 독립적으로 적용됩니다.':'弱い音から強い音へ色が変わります。エフェクトスタイルとは別に設定できます。',
'음표의 발광·반짝임과 색상':'音符の発光・きらめきと色',
'건반 타건광·낙하 노트·파티클':'打鍵の光・落下ノート・パーティクル',
'악보 발광 · 색상 반응':'楽譜の発光 · 色の変化',
'기타 기존 효과 · 제목 · 장면 옵션':'その他のエフェクト · タイトル · シーン設定',
'벨로시티 색상':'ベロシティによる色変化',
'타건 후 건반에서 솟아오르기':'打鍵後に鍵盤から立ち上がる',
'내려오기':'落下','솟아오르기':'上昇','둘 다':'両方','끄기':'オフ',
'파티클 수':'パーティクル数','파티클 크기':'パーティクルの大きさ',
'파티클 수명':'パーティクルの寿命',
'배경 색온도 반영':'背景の色温度を反映',
'흰 건반 표면 밝기':'白鍵表面の明るさ',
'메뉴':'メニュー','미리보기':'プレビュー','재생':'再生','일시정지':'一時停止',
'정지':'停止','전체화면':'全画面','이전 마디':'前の小節','다음 마디':'次の小節',
'악보 확대':'楽譜の拡大','영상 화면 비율':'動画の縦横比',
'배경 이미지 지정':'背景画像を指定','배경 이미지 제거':'背景画像を削除',
'추천 악보 디자인':'おすすめの楽譜デザイン',
'추천 테마 색상':'おすすめのテーマカラー',
'추출된 대표 색상':'抽出した代表色','테마 대표 색상':'テーマの代表色',
'렌더링 취소':'レンダリングをキャンセル','렌더링 준비 중':'レンダリングを準備中',
'렌더링 취소 중...':'レンダリングをキャンセル中...',
'렌더링 중...':'レンダリング中...',
'MP4로 내보내기':'MP4 を書き出す','MP4 출력':'MP4 書き出し',
'동기화':'同期','싱크 검사':'同期チェック','다시 검사':'再チェック',
'배경 세로 위치':'背景の縦位置','영상 배경 조정':'動画の背景調整',
'악보 자동 정렬':'楽譜の自動配置','악보 영역 배경색':'楽譜エリアの背景色',
'건반 타건 빛':'打鍵時の発光','미니멀 모드':'ミニマルモード',
'음표머리':'符頭','흰 건반':'白鍵','검은 건반':'黒鍵',
'언어':'言語','언어 선택':'言語を選択','한국어':'한국어','English':'English',
'일본어':'日本語','이 컴퓨터에서만 실행':'このパソコン上でのみ実行',
'음표 바 애니메이션':'ノートバーのアニメーション',
'타건 후 상승형':'打鍵後に上昇','타건 전 낙하형':'打鍵前に落下',
'사용자 지정':'カスタム','자동':'自動','수동':'手動',
'속도':'速度','강도':'強さ','밝기':'明るさ','두께':'太さ',
'지속 시간':'持続時間','색상':'色','너비':'幅','높이':'高さ',
'제목':'タイトル','음표':'音符','오선':'五線','건반':'鍵盤',
'악보 없음':'楽譜なし','오디오 없음':'オーディオなし',
'MIDI 연주 정보':'MIDI 演奏情報','완성 오디오 (선택)':'完成オーディオ（任意）',
'MIDI 파일은 필수입니다. MusicXML만으로는 업로드할 수 없습니다.':'MIDI ファイルが必要です。MusicXML だけではアップロードできません。',
'파일이 선택되지 않았습니다':'ファイルが選択されていません',
'이 이미지를 영상 배경으로 지정':'この画像を動画の背景に設定',
'현재 영상 배경':'現在の動画背景',
'배경 이미지가 없을 때':'背景画像がない場合',
'갤러리 페이퍼':'ギャラリーペーパー','소프트 캔버스':'ソフトキャンバス',
'기타':'その他','기본':'標準',
'보통':'標準','높음':'高','낮음':'低',
'사용':'使用','사용 안 함':'使用しない',
'미리보기 도구':'プレビューツール','파일 안내':'ファイルの案内',
}

# Generate fully localized short labels where a known Korean phrase can be
# segmented safely. Longer prose is intentionally retained in English rather
# than producing inaccurate hybrid machine-like Japanese.
SEGMENTS={
'파일':'ファイル','악보':'楽譜','건반':'鍵盤','음표':'音符','영상':'動画',
'배경':'背景','효과':'エフェクト','색상':'色','빛':'光','강도':'強さ','밝기':'明るさ',
'패널':'パネル','투명도':'透明度','불투명도':'不透明度','확대':'拡大','축소':'縮小',
'설정':'設定','적용':'適用','저장':'保存','선택':'選択','삭제':'削除',
'재생':'再生','시간':'時間','위치':'位置','마디':'小節','화면':'画面',
'비율':'比率','전체':'全体','실행':'実行','속도':'速度','기본':'基本',
'추천':'おすすめ','팔레트':'パレット','테마':'テーマ','새로운':'新しい',
'자동':'自動','수동':'手動','사용':'使用','표시':'表示','정렬':'配置',
'내보내기':'書き出し','초기화':'初期化','불러오기':'読み込み',
'슬라이더':'スライダー','고급':'詳細','방식':'方式','카메라':'カメラ',
'색온도':'色温度','수평':'水平','수직':'垂直',
'타건':'打鍵','손':'手','발광':'発光','강약':'強弱',
'윤곽선':'輪郭','입자':'粒子','수명':'寿命','길이':'長さ',
'배치':'配置','행':'行','자르기':'切り取り','간격':'間隔',
'켜기':'オン','끄기':'オフ','필수':'必須',
'분석':'分析','결과':'結果','다운로드':'ダウンロード',
'분류':'分類','오디오':'オーディオ','디자인':'デザイン',
'프리셋':'プリセット','타이틀':'タイトル','드래그':'ドラッグ',
'옵션':'オプション','모드':'モード','연동':'連動','패턴':'パターン',
'영역':'エリア','미리보기':'プレビュー','커서':'カーソル',
'편집':'編集','취소':'キャンセル','확인':'確認',
'키보드':'キーボード','음원':'音源',
'반응':'反応','음악':'音楽','색':'色','추출':'抽出','오선':'五線',
'파티클':'パーティクル','줌':'ズーム','마진':'余白',
'낙하':'落下','상승':'上昇','속성':'属性','대비':'コントラスト',
'다음':'次','이전':'前','켜짐':'オン','꺼짐':'オフ'
}

# Plain-English technical terms that are standard in Japanese audio/UI work.
EN_SHORT={
'Gallery Paper':'ギャラリーペーパー','Soft Canvas':'ソフトキャンバス',
'Score FX':'楽譜エフェクト','Keyboard FX':'鍵盤エフェクト',
'Clean Glow':'クリーングロー','Soft Glow':'ソフトグロー',
'Shimmer':'きらめき','Key Glow':'打鍵グロー','Particle Burst':'パーティクルバースト',
'Custom':'カスタム','Reset':'リセット','Settings':'設定',
'Score preview':'楽譜プレビュー','Loading…':'読み込み中…',
'Confirm':'確認','Cancel':'キャンセル','Export':'書き出し',
'Preview':'プレビュー','File':'ファイル',
}

from i18n_additions import EXTRA
for source,(english,japanese) in EXTRA.items():
    ko['legacy'][source]=source
    en['legacy'][source]=english
    REVIEWED[source]=japanese
ja_legacy={}; reviewed=0; segmented=0; english_fallback=[]
for source,eng in en['legacy'].items():
    if source in REVIEWED:
        ja_legacy[source]=REVIEWED[source]; reviewed+=1;continue
    if source in LEGACY:
        ja_legacy[source]=LEGACY[source]; reviewed+=1;continue
    if eng in EN_SHORT:
        ja_legacy[source]=EN_SHORT[eng]; reviewed+=1;continue
    # Full Japanese only when Korean label splits into *known* safe pieces;
    # never attempt this for full sentences, UI help or dynamic prose.
    if len(source)<=36 and not any(ch in source for ch in '.?!。！？{}\\$') and not any(ch in source for ch in '\n()'):
        import re
        japanese=re.sub(r'[가-힣]+',lambda m: SEGMENTS.get(m.group(0),m.group(0)),source)
        if not re.search('[가-힣]',japanese) and japanese!=source:
            ja_legacy[source]=japanese;segmented+=1;continue
    ja_legacy[source]=eng
    english_fallback.append(source)

ja_patterns=[]
for p in en['patterns']:
    item=dict(p)
    # Translate known message patterns when a reviewed Japanese pattern exists;
    # otherwise keep the existing meaningful English rather than Korean.
    jp_pattern={
      'render_error_audio':'オーディオ再生失敗: $1',
      'render_error_webm':'WebM 録画失敗: $1',
      'render_error_background':'動画背景の適用に失敗: $1',
      'render_error_short':'MP4 書き出し失敗: $1',
      'render_err_unsupported':'このブラウザーでは全画面プレビューを利用できません。'
    }.get(item['id'])
    if jp_pattern:item['template']=jp_pattern
    ja_patterns.append(item)

MESSAGES.update({
  'app.title':'ScoreMotion · ワークスペース',
  'file.resetHelp':'現在のファイル・音源・背景・プレビューを消去して新しい曲を始めます',
  'file.reset':'↺ 初期化',
  'palette.schemeHelp':'デザインを選ぶと楽譜・パネル背景・光・鍵盤の色が連動します。パネルの透明度はコントラストに合わせて自動設定され、後から調整できます。',
  'effects.rendererRunning':'GPU エフェクトエンジンを使用中',
  'export.defaultChoice':'標準設定',
  'export.offlineDescription':'ブラウザーで各フレームを正確な時刻に生成します。4K・60fps は機器とエンコーダーが対応している場合に使用できます。曲全体の書き出しは未検証です。',
  'export.aspectHelp':'縦横比は上のプレビュー操作で設定します。',
  'export.autoQuality':'自動 · 品質優先',
  'export.ffmpegBitrateHelp':'互換 FFmpeg は従来の自動ビットレート設定を使用します。',
  'export.aspect45':'4:5 · SNS 縦向き',
  'export.aspectWidth':'縦横比の幅',
  'export.aspectHeight':'縦横比の高さ'
})
missing=set(ko['messages'])-set(MESSAGES)
if missing:raise SystemExit(f'Update reviewed Japanese messages: {sorted(missing)}')
ja={'locale':'ja','messages':{key:MESSAGES[key] for key in ko['messages']},'legacy':ja_legacy,'patterns':ja_patterns}
(HERE/'ja.json').write_text(json.dumps(ja,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report={'semantic':len(ja['messages']),'legacy':len(ja['legacy']),'legacy_reviewed':reviewed,'legacy_segmented':segmented,'legacy_english_fallback':len(english_fallback),'dynamic_patterns':len(ja_patterns),'english_fallback_sources':english_fallback}
output=HERE.parent.parent/'docs'/'I18N_JA_COVERAGE_v22.json'
output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Japanese locale generated:',{k:v for k,v in report.items() if k!='english_fallback_sources'})
