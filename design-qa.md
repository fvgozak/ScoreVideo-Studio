# ScoreMotion UI visual QA

- Source visual truth: `/Users/cobiyaff/Downloads/ChatGPT 이미지 2026년 11월 16일 오후 10_33_09.png` (780 × 915 px).
- Implementation evidence: in-app browser tab at `http://127.0.0.1:8765/`; viewport screenshot captured inline during this QA. No local screenshot file was produced by the browser tool.
- Viewport and normalization: 780 × 915 CSS px, source and browser capture compared at 1:1 display size; browser device scale was not reported.
- State: saved “blue sky” project, portrait 9:16, 185% score zoom. Source is a conceptual “Dream Journey” effect-tab mock, so musical content and exact text are not expected to match.

## Full-view and focused comparison

The five-icon rail, adjacent settings panel, dark palette, cyan accent, and persistent preview are present. The real player contains additional transport and output controls needed by the existing app, so its video frame is smaller than the conceptual mock. Focused checks covered the rail labels, effect preset cards, preview frame, transport, and output settings. Typography is readable in the settings panel (12–15 px controls/headings), although metadata and helper text remain compact (11 px). Spacing, panel borders, and radii are consistent. Existing project imagery remains sharp enough for the preview scale; no reference asset was replaced. App-specific copy reflects the real project and functions.

## Comparison history

1. [P1] The portrait preview was 257 × 458 px at 780 × 915, leaving excessive unused space. The UI uses a two-column layout from 701 px but `resizePreview()` applied its mobile half-height limit below 951 px.
2. Fixed the preview breakpoint to match the UI breakpoint. Browser post-fix observation: the stage is 313 × 557 px within a 430 × 577 px preview area.
3. File, score, scene, effects, and output tabs were selected in the browser. Each retained the same stage rectangle `(x=389, y=213, w=313, h=557)`; no console errors were reported.
4. After clearing the 780 × 915 viewport override, the browser's default 527 px wide viewport stacked settings above the preview without horizontal overflow; this is a separate responsive check, not a source-image comparison.

## Remaining findings

- [P3] The real application’s portrait frame is still narrower than the mock’s, owing to its status, aspect selector, transport, and layer controls. This preserves existing functions and does not obstruct editing.
- The effect appearance and video rendering were not tested; this was a UI layout visual check only.

Final result: passed
