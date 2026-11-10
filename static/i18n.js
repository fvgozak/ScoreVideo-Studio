/* Small offline UI localization layer. Korean is the source language; English
 * translations are applied to text and common accessibility attributes. */
(function(root){
 'use strict';
 const english={
  '언어':'Language','언어 선택':'Choose language','작업 설정':'Workspace settings','악보 확대 및 동기화 조절':'Score zoom and sync controls','악보 확대 비율':'Score zoom level','악보 축소':'Zoom out score','악보 확대':'Score zoom','악보 확대를 100%로 초기화':'Reset score zoom to 100%','MIDI의 첫 타건과 음원의 첫 소리를 자동으로 맞춥니다':'Automatically align the first MIDI attack with the first audio sound','이 컴퓨터에서만 실행':'Runs on this computer only',
  '연주를 따라 움직이는':'Make','악보 영상':'an animated score video','을 만들어보세요.':'that follows the performance.',
  'MusicXML과 MIDI의 실제 연주 음표를 매칭해 악보 위치를 계산합니다. 완성 음원을 함께 넣어 MP4로 출력하세요.':'Match MusicXML notes to MIDI performance timing, then add the finished audio to export an MP4.',
  '파일':'Files','악보':'Score','디자인':'Design','출력':'Export','파일 불러오기':'Load files','MusicXML 악보':'MusicXML score','MIDI 연주 정보':'MIDI performance','완성 오디오':'Audio track','선택':'Choose file','악보 불러오기':'Load score',
  '▶ Dream Journey 예제 바로 체험하기':'▶ Try the Dream Journey demo','샘플 악보·MIDI·음원과 커버 이미지를 불러옵니다. 파일을 직접 선택하지 않아도 돼요.':'Loads the sample score, MIDI, audio, and cover image. No manual file selection needed.',
  'MusicXML 악보 음표와 MIDI의 실제 타건을 음고·순서로 정렬합니다. 페르마타 뒤 정박 어긋남도 보정합니다.':'Matches score notes to MIDI pitches and order, including timing shifts after fermatas.',
  '악보 레이아웃 · 시각 효과':'Score layout · visual effects','악보 영역은 화면에서 직접 편집':'Edit the score area directly on screen','미리보기의':'In the preview,','영역 편집':'Edit area','을 누르고 끌어 위치를 바꾸세요. 가장자리 핸들로 너비·높이를 조절할 수 있어요.':'then drag to move it. Use the edge handles to resize.',
  '▢ 미리보기에서 영역 편집':'▢ Edit score area in preview','레이아웃':'Layout','페이지 레이아웃 · Page Layout':'Page layout','싱글라인 · Single Line Follow':'Single line · follow','페이지 레이아웃은 한 줄에 적절한 마디 수로 내려가며, 싱글라인은 가능한 한 한 줄로 길게 펼쳐 카메라가 따라갑니다.':'Page layout wraps measures into systems. Single line keeps the score wide and follows it with the camera.',
  '악보 위치 X':'Score position X','싱글라인 내부 악보 위치 Y':'Score position Y in single-line mode','아래 표시 영역 안에서 악보가 시작되는 높이. 싱글라인에서만 작동합니다.':'Vertical score position inside the display area. Single-line mode only.',
  '수치로 정밀 조정 · 영역 / 여백 / 배경':'Fine adjustment · area / margins / background','악보 영역 가로 위치':'Score area horizontal position','영상 전체와 분리된 창을 지정합니다. 음악을 재생하면 악보만 이 영역 안에서 움직입니다.':'Set a score window separate from the full video. Only the score moves inside it during playback.',
  '표시 영역 너비':'Display area width','표시 영역 높이':'Display area height','위쪽 여백':'Top margin','0%는 영상의 맨 위에서 악보 표시 영역이 시작됩니다. 제목과 겹치면 여백을 직접 늘리세요.':'At 0%, the score area starts at the top edge. Increase the margin if it overlaps the title.','아래쪽 여백':'Bottom margin','악보 영역 배경색':'Score area background','패널 불투명도':'Panel opacity','✦ 사진용 가독성 프리셋 · 검정 55%':'✦ Photo readability preset · 55% black','패널은 악보 표시 영역 안에만 적용됩니다. 배경 사진은 영상 전체에 그대로 남습니다.':'The panel only covers the score area. The background photo remains visible across the video.',
  '악보 색상 · 커서 · 음표 반응':'Score colors · cursor · note response','테마 기준색':'Theme color','Auto 팔레트':'Auto palette','✦ 색상 자동 설정':'✦ Set colors automatically','기준색과 어울리는 배경·오선·음표·커서·발광 색상을 자동으로 제안합니다. 이후 각 색을 개별 수정할 수 있습니다.':'Suggests matching paper, staff, note, cursor, and glow colors. Adjust each color afterward.',
  '색상 반전':'Invert colors','배경 ↔ 음표 기본색':'Paper ↔ note colors','악보 바탕색':'Score paper','오선색':'Staff color','음표색':'Note color','커서색':'Cursor color','강조색':'Accent color','빛 색':'Glow color','커서 표시':'Show cursor','영상과 미리보기에서 재생 위치를 표시':'Show playback position in the video and preview','커서 이동':'Cursor movement','부드럽게 · 다음 음표 직전에 이동':'Smooth · moves just before the next note','즉시 · 음표마다 이동':'Instant · jumps at each note','음표 타건 시점은 그대로 두고, 커서의 시각적 이동만 보간합니다. 행이 바뀔 때는 연결하지 않습니다.':'Only the cursor motion is interpolated; note timing stays exact. The cursor does not glide between systems.',
  '악보 바탕 패턴':'Score paper texture','없음 · 단색':'None · solid','종이 질감':'Paper','양피지':'Parchment','잔잔한 입자':'Fine grain','린넨':'Linen','도트':'Dots','글리터':'Glitter','악보 위 미세한 빛 입자':'Fine light particles over the score','연주 음표 반짝임':'Highlight played notes','현재 연주 중인 음표만 강조':'Highlight only the currently played notes','MIDI 벨로시티 반응':'MIDI velocity response','강약에 따라 빛과 움직임이 달라져요':'Light and motion respond to dynamics','연주 음표 미세 움직임':'Subtle note motion','타건 시 부드럽게 확대·상승 후 복귀':'Notes gently rise and enlarge when played, then return','음표 반응 세기':'Note response strength','0%에서는 벨로시티 효과가 적용되지 않습니다. 오선과 음표 사이의 간격은 변하지 않습니다.':'At 0%, velocity effects are disabled. Spacing between staves and notes stays unchanged.',
  '악보 그리기 애니메이션':'Draw-on score animation','오선은 펼쳐지고 음표는 MIDI 타건 순서로 그려져요':'Staff lines reveal progressively; notes draw in MIDI attack order',
  '✦ 이미지에서 색상 조합 찾기':'✦ Find a color palette from an image','앨범 커버·사진·일러스트를 넣으면 색상을 추출하고 악보가 잘 읽히는 디자인을 추천합니다.':'Choose an album cover, photo, or illustration to extract colors and get readable score designs.','▧ 이미지 선택 또는 드래그 앤 드롭':'▧ Choose or drag an image','현재 영상 배경 사진에서 추출':'Extract from current background','이미지를 선택하면 자동으로 추천 조합을 만들어요.':'Choose an image to generate palette suggestions.','추출된 대표 색상':'Extracted colors','추천 악보 디자인':'Recommended score designs','선택하면 즉시 적용':'Click to apply','체크하면 이 이미지가 영상 배경으로 바로 적용됩니다':'Check to apply this image as the video background','추천 조합은 오선·음표·배경색·커서·빛과 Aurora 색상을 설정합니다. 각 색상은 아래에서 다시 조절할 수 있어요.':'A design sets staff, notes, paper, cursor, glow, and Aurora colors. Adjust each color below.',
  '영상 배경':'Video background','그림을 고르면 미리보기와 MP4의 전체 배경에 적용됩니다. 그림 맞춤과 위치도 여기서 조절하세요.':'The image becomes the full background in the preview and MP4. Adjust its fit and position here.','배경 이미지 선택':'Choose background image','최대 20MB · PNG / JPG / WebP · 먼저 악보·MIDI·음원을 불러오세요.':'Up to 20 MB · PNG / JPG / WebP · Load a score, MIDI, and audio first.','배경 이미지 제거':'Remove background image','사진 투명도':'Photo opacity','배경 이미지 맞춤':'Background fit','화면 채우기 (잘릴 수 있음)':'Fill screen (may crop)','전체 표시 (여백 가능)':'Show full image (may leave margins)','배경 가로 위치':'Background horizontal position','배경 세로 위치':'Background vertical position',
  '장면 · 카메라 · 빛':'Scene · camera · light','영상 스타일':'Video style','Minimal Score · 종이 질감과 절제된 빛':'Minimal Score · paper and subtle light','Illustrated Story · 따뜻한 일러스트':'Illustrated Story · warm illustration','Cinematic Score · 오로라와 잔광':'Cinematic Score · aurora and trails','카메라':'Camera','Follow · 연주 위치를 따라가기':'Follow · track the performance','Cinematic · 유려한 카메라':'Cinematic · smooth camera','Fixed · 카메라 고정':'Fixed · locked camera','음표 발광 스타일':'Note glow style','Soft Bloom · 번지는 빛':'Soft Bloom · diffuse glow','Glitter Dust · 음표 반짝임':'Glitter Dust · sparkling notes','Light Trail · 손별 빛의 궤적':'Light Trail · colored trails by hand','Resonance · 확산 동심원':'Resonance · expanding rings','없음':'None','오른손 · 윗오선':'Right hand · upper staff','왼손 · 아랫오선':'Left hand · lower staff','✦ 테마색으로 궤적 2색 Auto':'✦ Auto trail colors from theme','오선별로 색을 고정합니다. 행이 바뀌면 이전 궤적을 끊고 새 행의 첫 음에서 다시 시작합니다.':'Colors stay assigned to each staff. Trails reset when playback moves to a new system.',
  '빛 컨트롤 · 색상 반응':'Light control · color response','고정 색상 · 벨로시티는 밝기/강도만 반영':'Fixed color · velocity changes brightness only','Aurora · 벨로시티에 따라 빛 색상 변화':'Aurora · light color follows velocity','발광 스타일(Bloom · Glitter · Light Trail · Resonance)과 별개입니다. 어떤 스타일에도 색상 반응을 조합할 수 있습니다.':'Independent of glow style (Bloom, Glitter, Light Trail, Resonance). Combine with any style.',
  'Aurora · 강약별 색상 프리셋':'Aurora · velocity color preset','Polar · 약한 음 파랑 / 강한 음 빨강':'Polar · blue low / red high','Sunset · 청록 / 주황':'Sunset · teal / orange','Orchid · 남보라 / 분홍':'Orchid · violet / pink','Forest · 청록 / 황금':'Forest · teal / gold','Theme Auto · 테마 색상 기반':'Theme Auto · based on theme','직접 선택':'Custom','약한 타건 (pp)':'Soft notes (pp)','강한 타건 (ff)':'Loud notes (ff)','강약 색상 기준':'Velocity color scale','절대값 · MIDI 1~127':'Absolute · MIDI 1–127','상대값 · 이 MIDI의 최저~최고':'Relative · this MIDI range','상대값은 이 곡의 실제 벨로시티 범위를 색상 전체에 배분합니다.':'Relative mode maps this song’s velocity range across the full color scale.','약한 타건은 왼쪽 색, 강한 타건은 오른쪽 색에 가까워집니다. 발광 스타일과 독립적으로 작동합니다.':'Soft notes use the left color and loud notes use the right. Independent of glow style.','빛 효과 강도':'Glow strength',
  '제목 · 텍스트 · 장면 전환 상세':'Title · text · scene transition details','영상 제목 · 파일명 자동 입력':'Video title · defaults to file name','파일명 제목으로 되돌리기':'Reset title to file name','텍스트 글꼴':'Text font','Sans · 현대적인 고딕':'Sans · modern','Serif · 클래식 명조':'Serif · classic','Rounded · 부드러운 제목':'Rounded · friendly','Mono · 타자기 글꼴':'Mono · typewriter','Korean · 한글 가독성':'Korean · readable Hangul','제목과 악보 사이 여백':'Title-to-score spacing','영상의 실제 픽셀 기준. 변경 시 미리보기 악보도 다시 배치합니다.':'In actual video pixels. Changing this also repositions the preview score.','아티스트':'Artist','엔딩 크레딧':'End credits','영상 내 제목/크레딧 표시':'Show title and credits in video','배경색 키프레임 전환':'Animate background colors','선택할 때만 기본 배경색보다 우선 적용':'Overrides base background colors only when enabled','시작 배경색':'Starting background','종료 배경색':'Ending background','시작 빛색':'Starting glow','종료 빛색':'Ending glow','색상 전환 종료 시점':'Color transition end','모든 장면 효과는 재생 시간으로 계산하며, 미리보기와 MP4가 동일한 무대 엔진을 사용합니다.':'Scene effects use playback time. Preview and MP4 share the same renderer.',
  '영상 설정':'Video settings','설정 이름':'Preset name','저장한 영상 설정':'Saved video settings','예: A곡 · Shorts':'e.g. Song A · Shorts','현재 설정 저장':'Save current settings','저장한 설정':'Saved settings','저장한 설정 없음':'No saved settings','불러오기':'Load','삭제':'Delete','화면비·해상도·레이아웃·색상·카메라·빛·제목을 저장합니다. 연결된 곡과 배경 이미지도 함께 불러옵니다.':'Saves aspect ratio, resolution, layout, colors, camera, lighting, and title. Reopens the linked song and its background image too.','현재 곡을 먼저 불러와 주세요.':'Load a song first.','설정 이름을 입력해 주세요.':'Enter a preset name.','영상 설정을 저장했습니다.':'Video settings saved.','저장한 영상 설정을 불러왔습니다.':'Saved video settings loaded.','저장한 영상 설정을 삭제했습니다.':'Saved video settings deleted.','저장된 곡을 찾지 못했습니다.':'The saved song could not be found.','설정을 저장하지 못했습니다: ':'Could not save settings: ','설정을 불러오지 못했습니다: ':'Could not load settings: ','SNS 화면비 프리셋':'Social video aspect ratio','16:9 · YouTube 가로 (1920×1080)':'16:9 · YouTube landscape (1920×1080)','1:1 · 정사각형 (1080×1080)':'1:1 · Square (1080×1080)','4:5 · Instagram 피드 (1080×1350)':'4:5 · Instagram feed (1080×1350)','3:4 · 세로 포스트 (1080×1440)':'3:4 · Portrait post (1080×1440)','4:3 · 가로 포스트 (1440×1080)':'4:3 · Landscape post (1440×1080)','21:9 · 시네마 와이드 (2560×1080)':'21:9 · Cinematic wide (2560×1080)','16:9 · 빠른 시험용 (1280×720)':'16:9 · Quick preview (1280×720)','미리보기의 화면비도 영상과 동일하게 변경됩니다.':'The preview uses the same aspect ratio as the exported video.','프레임 레이트':'Frame rate','12 fps — 빠른 테스트용':'12 fps — fast preview','24 fps — 권장':'24 fps — recommended','30 fps — 부드러운 영상':'30 fps — smoother video','MP4 출력':'MP4 export','인코딩 최적화':'Encoding optimization','Auto · 실행 PC에서 실측 후 자동 결정 (권장)':'Auto · benchmark this computer (recommended)','고화질 · 무손실 PNG 캡처 우선':'High quality · prefer lossless PNG capture','속도 우선 · JPEG 96 캡처':'Speed first · JPEG 96 capture','GPU 인코더는 실제로 작동하는지 시험합니다. 사용 가능한 인코더 중 처리 속도가 유리한 방식을 고르고, 하드웨어 실패 시 CPU로 다시 출력합니다.':'GPU encoders are tested before use. The fastest working encoder is selected; failed hardware encoding falls back to CPU.','MP4로 내보내기':'Export MP4','대기 중':'Waiting','완성된 영상 다운로드 ↓':'Download finished video ↓','영상은 프레임 단위로 제작합니다. 긴 곡은 출력 시간이 길어질 수 있습니다.':'The video is rendered frame by frame. Long tracks may take time.',
  '악보 미리보기':'Score preview','파일 세 개를 선택해 주세요.':'Choose the three source files.','100% 복원':'Reset to 100%','매칭 —':'Match —','첫 소리 대기':'Sync pending','싱크 대기':'Sync pending','✦ 첫 소리 싱크':'✦ First-sound sync','미세 조정':'Fine tune','수동 미세 조정':'Manual offset','0.00초':'0.00 s','-5초':'-5 s','+5초':'+5 s','자동 싱크에 ±5초를 더하거나 빼서 맞출 수 있습니다.':'Adjust the automatic sync by up to ±5 seconds.','자동 싱크 초기화':'Reset auto sync','악보가 여기에 표시됩니다':'Your score appears here','MusicXML · MIDI · 음원 파일을 업로드해 시작하세요.':'Upload MusicXML, MIDI, and audio files to begin.','악보 영역 · 끌어서 이동':'Score area · drag to move','마디 —':'Measure —','재생/일시정지':'Play/pause','이전·다음 마디':'Previous/next measure','5초 이동':'Seek 5 seconds','▢ 악보 영역 편집':'▢ Edit score area','가로 중앙':'Center horizontally','⛶ 전체화면':'⛶ Fullscreen','미리보기 재설정':'Reset preview','설정은 미리보기와 MP4에 같은 값으로 적용됩니다.':'Preview and MP4 use the same settings.','미리보기와 MP4: 같은 설정 · 같은 장면 엔진':'Preview and MP4: same settings · same scene renderer','장면 타임라인':'Scene timeline','음원 · 악보':'Audio · score','배경 전환':'Background transition','발광 효과':'Glow effects','동기화 방식':'Sync method','자동 싱크는 MIDI 첫 타건과 음원 첫 유효한 소리를 맞춥니다. 뒤쪽 구간에서 루바토가 달라지면 별도 정렬이 필요할 수 있습니다.':'Auto sync aligns the first MIDI attack with the first audible sound. Later rubato may need additional adjustment.','ScoreVideo Local · 파일은 로컬 작업 폴더에 저장되며 외부로 업로드되지 않습니다.':'ScoreVideo Local · files stay in the local project folder and are never uploaded.',
  '테마와 어울리는 오선·음표·배경·발광 및 오른손/왼손 궤적 2색을 자동 설정했습니다.':'Theme-matched staff, notes, paper, glow, and right/left hand trail colors applied.','테마 기준색에 맞춰 오른손과 왼손 궤적색을 자동 설정했습니다.':'Right and left hand trail colors matched to the theme.','이미지는 20MB 이하로 선택해 주세요.':'Choose an image up to 20 MB.','이미지의 색상을 분석하고 있습니다…':'Analyzing image colors…','현재 영상 배경 이미지를 읽고 있습니다…':'Loading the current background image…','선택한 그림을 미리보기와 영상 배경에 적용했습니다. 디자인 탭에서 투명도와 위치를 조절할 수 있어요.':'Image applied to preview and video background. Adjust opacity and position in Design.','먼저 영상 배경으로 사용할 이미지를 선택해 주세요.':'Choose an image to use as the video background first.','영상 배경에서 그림을 제거했습니다.':'Removed the image from the video background.','먼저 악보·MIDI·음원을 업로드해 주세요.':'Load the score, MIDI, and audio first.','배경 이미지를 미리보기와 출력 설정에 적용했습니다. 디자인 탭에서 추천 팔레트를 확인하세요.':'Background applied to preview and export. Find palette suggestions in Design.','배경 이미지를 제거했습니다.':'Removed the background image.','악보 ↔ MIDI 실제 타건 시간 매칭 완료. 미리보기와 MP4에 동일하게 반영됩니다.':'Score/MIDI performance timing matched. The same timing is used in preview and MP4.','MusicXML, MIDI, 음원 파일을 모두 선택해 주세요.':'Choose MusicXML, MIDI, and audio files.','Dream Journey 예제 파일을 준비하고 있습니다...':'Preparing Dream Journey demo files...','싱크 초기화됨.':'Sync reset.','마디 위치를 읽지 못했습니다. 악보 로딩 상태를 확인해 주세요.':'Could not read measure position. Check that the score loaded.','먼저 악보, MIDI, 음원을 불러오세요.':'Load the score, MIDI, and audio first.','오디오 재생 실패: ':'Audio playback failed: ','전체화면 전환 실패: ':'Could not enter fullscreen: ','미리보기와 같은 설정으로 프레임별 영상 출력 중입니다.':'Exporting video frame by frame with preview settings.','이전 프로젝트 복원 실패: ':'Could not restore previous project: '
 };
 const dynamic=[
  [/^악보 로딩 실패: (.*)$/,'Score load failed: $1'],
  [/^예제 준비 실패: (.*)$/,'Could not load demo: $1'],
  [/^미리보기 적용 실패: (.*)$/,'Preview update failed: $1'],
  [/^이미지 분석 실패: (.*)$/,'Image analysis failed: $1'],
  [/^색상은 적용했습니다\. 이미지 배경: (.*)$/,'Colors applied. Image background: $1'],
  [/^(.*) 디자인과 사진 배경을 적용했습니다\. HEX 색상은 아래에서 수정할 수 있어요\.$/,'$1 design and photo background applied. Adjust HEX colors below.'],
  [/^(.*) 디자인을 적용했습니다\. 색상은 개별 수정할 수 있어요\.$/,'$1 design applied. You can adjust colors individually.'],
  [/^영상 배경 적용 실패: (.*)$/,'Could not apply video background: $1'],
  [/^악보\/(?:MIDI|MIDI) 음표 매칭 (\d+)% — 일치하지 않는 음표가 있어 영상 싱크를 확인해 주세요\.$/,'Score/MIDI match $1% — some notes did not match. Check video sync.'],
  [/^되돌이표를 MIDI 연주 순서로 전개했습니다 \((\d+)→(\d+)마디\)\. 미리보기·MP4에 동일 적용됩니다\.$/,'Repeats unfolded to MIDI playback order ($1→$2 measures), for both preview and MP4.'],
  [/^첫 소리 자동 싱크 적용\. 뒤쪽 마디에서도 연주 시점을 확인해 주세요\.$/,'First-sound sync applied. Check timing in later measures too.'],
  [/^MP4 영상 출력 완료\. 미리보기와 동일한 장면 엔진을 사용했습니다\.$/,'MP4 export complete. It uses the same scene renderer as the preview.'],
  [/^MP4 출력 실패: (.*)$/,'MP4 export failed: $1'],
  [/^([+-]?[\d.]+)초$/,'$1 s'],
  [/^마디 (\d+)\/(\d+)$/,'Measure $1/$2'],
  [/^악보와 MIDI 음표 매칭 (\d+)%/,'Score/MIDI note match $1%'],
  [/^악보↔MIDI 매칭 (\d+)% · (\d+)\/(\d+)개 음표 · 실제 타건 시점 적용$/,'Score↔MIDI match $1% · $2/$3 notes · performance timing applied'],
  [/^악보 ↔ MIDI 매칭 주의 \((\d+)%\): (.*)$/,'Score ↔ MIDI match warning ($1%): $2'],
  [/^첫 소리 자동 싱크 · MIDI ([\d.]+)초 → 음원 ([\d.]+)초 · 보정 ([+-]?[\d.]+)초$/,'First-sound sync · MIDI $1 s → audio $2 s · offset $3 s'],
  [/^동기화 보정 ([+-]?[\d.]+)초$/,'Sync offset $1 s'],
  [/^매칭 (\d+)%$/,'Match $1%'],
  [/^싱크 ([+-]?[\d.]+)초$/,'Sync $1 s'],
  [/^음원 \d+초 · MIDI \d+초/,'Audio · MIDI'],
  [/^환경 분석:/,'Profiling:'],
  [/^완료: (.*)$/,'Done: $1']
 ];
 const originals=new WeakMap(), translated=new WeakMap(), attrOriginals=new WeakMap(), attrTranslated=new WeakMap();
 let locale=localStorage.getItem('scorevideo_language')||'ko',applying=false;
 function translate(text){
  if(locale!=='en')return text;
  const trimmed=text.trim();
  if(Object.prototype.hasOwnProperty.call(english,trimmed))return text.replace(trimmed,english[trimmed]);
  for(const [pattern,replacement] of dynamic)if(pattern.test(trimmed))return text.replace(trimmed,trimmed.replace(pattern,replacement));
  return text;
 }
 function translateText(node,mutation=false){
  if(!originals.has(node))originals.set(node,node.nodeValue);
  else if(mutation&&node.nodeValue===translated.get(node))return;
  else if(mutation)originals.set(node,node.nodeValue);
  const source=originals.get(node),next=locale==='ko'?source:translate(source);
  if(node.nodeValue!==next){translated.set(node,next);node.nodeValue=next;}else translated.set(node,next);
 }
 function translateAttribute(el,name,mutation=false){
  if(!attrOriginals.has(el))attrOriginals.set(el,{});
  const saved=attrOriginals.get(el),values=attrTranslated.get(el)||{};
  if(saved[name]===undefined)saved[name]=el.getAttribute(name)||'';
  else if(mutation&&el.getAttribute(name)===values[name])return;
  else if(mutation)saved[name]=el.getAttribute(name)||'';
  const next=locale==='ko'?saved[name]:translate(saved[name]);
  if(el.getAttribute(name)!==next){values[name]=next;el.setAttribute(name,next);}else values[name]=next;
  attrTranslated.set(el,values);
 }
 function walk(node,mutation=false){
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode(n){return n.nodeType===1&&/^(SCRIPT|STYLE)$/i.test(n.tagName)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
  if(node.nodeType===3)translateText(node,mutation);
  else if(node.nodeType===1){for(const a of ['title','aria-label','placeholder','alt'])if(node.hasAttribute(a))translateAttribute(node,a,mutation);}
  let current;while((current=walker.nextNode())){
   if(current.nodeType===3)translateText(current,mutation);
   else for(const a of ['title','aria-label','placeholder','alt'])if(current.hasAttribute(a))translateAttribute(current,a,mutation);
  }
 }
 function setLocale(next){
  locale=next==='en'?'en':'ko';localStorage.setItem('scorevideo_language',locale);
  document.documentElement.lang=locale;
  const select=document.getElementById('languageSelect');if(select)select.value=locale;
  walk(document.body,false);
 }
 const select=document.getElementById('languageSelect');if(select)select.addEventListener('change',()=>setLocale(select.value));
 setLocale(locale);
 const observer=new MutationObserver(records=>{
  if(applying)return;applying=true;
  for(const record of records){
   if(record.type==='characterData')translateText(record.target,true);
   else if(record.type==='attributes')translateAttribute(record.target,record.attributeName,true);
   else for(const node of record.addedNodes)if(node.nodeType===1||node.nodeType===3)walk(node,true);
  }
  applying=false;
 });
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder','alt']});
 root.ScoreI18n={get locale(){return locale;},setLocale,translate};
})(window);
