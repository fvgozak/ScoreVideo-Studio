"""Additional user-facing literals found by the v22 source audit.

Keep only text visible to users (not identifiers, SQL, log tags or SVG notation).
Format: Korean source -> (English, Japanese). A future refactor can assign
stable semantic keys and replace callsites without breaking the current UI.
"""
EXTRA={
'되돌이표는 있으나 MIDI 반복 연주가 확인되지 않아 원본 순서를 사용합니다.':(
 'Repeat marks were found, but no matching MIDI repetitions were detected; using the original order.',
 '反復記号はありますが、MIDI の反復演奏が確認できないため元の順序を使用します。'),
'되돌이표를 실제 MIDI 연주 순서로 전개했습니다.':(
 'Repeat marks were expanded to match the performed MIDI order.',
 '反復記号を MIDI の実際の演奏順序に合わせて展開しました。'),
'반복기호 자동 전개 제한:':('Automatic repeat expansion limitation:', '反復記号の自動展開の制限:'),
'반복 펼치기는 score-partwise 악보에서만 지원합니다.':(
 'Repeat expansion is supported only for score-partwise MusicXML.',
 '反復展開は score-partwise MusicXML のみ対応しています。'),
'시작 되돌이표에 대응하는 끝 되돌이표가 없습니다.':(
 'The opening repeat sign has no matching closing repeat sign.',
 '開始反復記号に対応する終了反復記号がありません。'),
'파트마다 마디 개수가 달라 반복을 펼칠 수 없습니다.':(
 'Cannot expand repeats because parts have different measure counts.',
 'パートごとの小節数が異なるため反復を展開できません。'),
'같은 마디에서 시작하는 복수의 되돌이표를 자동 해석할 수 없습니다.':(
 'Multiple repeats starting in the same measure cannot be interpreted automatically.',
 '同じ小節で始まる複数の反復記号は自動解釈できません。'),
'겹쳐진 되돌이표 구조는 자동 해석할 수 없습니다.':(
 'Overlapping repeat structures cannot be interpreted automatically.',
 '重複する反復構造は自動解釈できません。'),
'D.C., D.S., Coda 이동은 아직 자동 반복 전개를 지원하지 않습니다.':(
 'D.C., D.S. and Coda jumps are not yet supported by automatic repeat expansion.',
 'D.C.、D.S.、Coda による移動は自動展開に対応していません。'),
'반복 전개가 10,000마디를 초과합니다.':(
 'Repeat expansion would exceed 10,000 measures.',
 '反復の展開が 10,000 小節を超えます。'),
'악보에 파트가 없습니다.':('No parts found in the score.', '楽譜にパートがありません。'),
'악보에 마디가 없습니다.':('No measures found in the score.', '楽譜に小節がありません。'),
'이미지는 PNG, JPG, WebP, BMP 또는 GIF여야 합니다.':(
 'Image must be PNG, JPG, WebP, BMP or GIF.',
 '画像は PNG、JPG、WebP、BMP、GIF のいずれかを使用してください。'),
'이미지는 20MB 이하로 업로드해 주세요.':(
 'Upload images smaller than 20 MB.', '20 MB 以下の画像をアップロードしてください。'),
'이미지를 읽지 못했습니다:':('Could not read image:', '画像を読み込めませんでした:'),
'이미지 해상도가 너무 큽니다.':('Image resolution is too large.', '画像の解像度が大きすぎます。'),
'지원하지 않는 이미지 형식입니다.':('Unsupported image format.', '対応していない画像形式です。'),
'렌더링을 취소했습니다':('Rendering was canceled.', 'レンダリングをキャンセルしました。'),
'완료':('Completed', '完了'),
'독립적인 시간축을 가진 MIDI Type 2는 지원하지 않습니다.':(
 'MIDI Type 2 with independent time axes is not supported.',
 '独立した時間軸を持つ MIDI Type 2 は対応していません。'),
'MIDI에서 연주 음표를 찾지 못했습니다.':(
 'No performed notes were found in the MIDI.',
 'MIDI に演奏音符が見つかりませんでした。'),
'오디오가 너무 짧아 첫 타건을 찾지 못했습니다.':(
 'Audio is too short to detect the first strike.',
 '音声が短すぎて最初の打鍵を検出できませんでした。'),
'첫 소리를 감지하기에 오디오가 너무 짧습니다.':(
 'Audio is too short to detect the first sound.',
 '最初の音を検出するには音声が短すぎます。'),
'음원에서 충분한 신호를 찾지 못했습니다.':(
 'Not enough signal was found in the audio.',
 '音源から十分な信号を検出できませんでした。'),
'음원의 첫 유효한 소리를 감지하지 못했습니다.':(
 'Could not detect the first valid sound in the audio.',
 '音源の最初の有効な音を検出できませんでした。'),
'음원 길이가 올바르지 않습니다.':(
 'Invalid audio duration.', '音源の長さが正しくありません。'),
'오디오 시작점 분석 실패:':(
 'Audio onset analysis failed:', '音声の開始位置の解析に失敗:'),
'음표·MIDI 타건 시점을 연결했습니다.':(
 'Score notes have been matched to MIDI strike times.',
 '楽譜の音符と MIDI の打鍵タイミングを照合しました。'),
'MusicXML과 MIDI의 음표가 일부 불일치합니다. 반복·전조·아르페지오 구간을 확인해 주세요.':(
 'Some MusicXML and MIDI notes do not match. Check repeats, modulations and arpeggios.',
 'MusicXML と MIDI の音符が一部一致しません。反復・転調・アルペジオを確認してください。'),
'파일 분석 및 필요한 피아노 음원 생성 중...':(
 'Analyzing files and generating piano audio if needed...',
 'ファイルを解析し、必要なピアノ音源を生成中...'),
'파일 분석 및 필요한 MIDI·피아노 음원 생성 중...':(
 'Analyzing files and generating MIDI and piano audio if needed...',
 'ファイルを解析し、必要な MIDI・ピアノ音源を生成中...'),
'PixiJS 필수 모듈이 누락되었습니다.':(
 'Required PixiJS module is missing.',
 '必要な PixiJS モジュールが見つかりません。'),
'PixiJS 효과 모듈이 로드되지 않았습니다.':(
 'PixiJS effects module was not loaded.',
 'PixiJS のエフェクトモジュールを読み込めませんでした。'),
'GPU 합성 모듈이 로드되지 않았습니다.':(
 'GPU compositor module was not loaded.',
 'GPU 合成モジュールを読み込めませんでした。'),
'출력 크기는 200~8192 범위의 짝수 픽셀이어야 합니다.':(
 'Output dimensions must be even pixel values between 200 and 8192.',
 '出力サイズは 200～8192 の偶数ピクセルで指定してください。'),
'인코더 확인 실패:':('Failed to check encoder:', 'エンコーダーの確認に失敗:'),
'보안 컨텍스트(로컬호스트 또는 HTTPS)가 필요합니다.':(
 'Secure context (localhost or HTTPS) is required.',
 '安全な接続（localhost または HTTPS）が必要です。'),
'완성된 MP4 파일이 유효하지 않습니다.':(
 'The generated MP4 file is invalid.',
 '生成した MP4 ファイルが無効です。'),
'OPFS 저장 공간에 접근할 수 없습니다.':(
 'Cannot access OPFS storage.', 'OPFS ストレージにアクセスできません。'),
'저장 공간 부족':('Not enough storage', 'ストレージ容量不足'),
'이 브라우저에서는 전체화면 미리보기를 지원하지 않습니다.':(
 'Fullscreen preview is unsupported in this browser.',
 'このブラウザーでは全画面プレビューを利用できません。'),
'화면비 가로':('Aspect width','縦横比の幅'),
'화면비 세로':('Aspect height','縦横比の高さ'),
}
