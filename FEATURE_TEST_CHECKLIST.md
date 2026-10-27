# 機能テスト用メモ（Monolio）

このメモは、アプリの機能がちゃんと動いているか、変更で壊れていないかを確認するためのチェックリストです。

ここに書いた機能は、実装変更やリファクタリングのあとに `npm run pwa:test` などで動作確認する対象とします。新しい機能を追加したら、このファイルにも確認観点を追記します。

## 指摘された不具合とテストの対応

報告された不具合は、必ずテスト(`editor-pwa/tests/` の core.mjs か suites/*.mjs)の項目として残します。
同じ症状が別の経路（選択のしかた・操作する道具）でも起きないよう、組み合わせも足しています。

| 報告された症状 | テスト項目 |
| --- | --- |
| `1` `.` `空白` のあと `Enter` `Enter` の挙動がおかしい | `numberedShortcutEnterReturnsParagraph` `bulletShortcutEnterReturnsParagraph` `emptyNumberedEnterReturnsParagraph` |
| 空ブロックで `Backspace` を押してもブロックが消えず前へ移動しない | `staleModelBackspaceRemovesBlock` `tableCellBackspaceKeepsBlock` `tableCellBackspaceKeepsText` |
| ダブルクリック・トリプルクリックの選択がおかしい | `doubleClickSelectsWord` `tripleClickSelectsBlock` `doubleClickSelectionCanBeTyped` `multiClickKeepsBlocksEditable` |
| 選択中のテキストをクリックしても選択が解除されない（最下ブロック） | `clickAfterTripleClickClearsSelection` `clickOnSelectionInLastBlockClears` |
| フォント一覧がOSの認識より少ない | `installedFontsAppearInPicker` `listingInstalledFontsEmbedsNothing` `applyingInstalledFontEmbedsIt` |
| `Default` 表示だけでは今の書体が分からない | `defaultFontOptionShowsFontName` `defaultFontOptionFitsSelect` |
| フォントを変えて書いても `Default` に戻される | `pendingFontShownBeforeTyping` `caretFontReachesTypedText` `caretFontKeepsSelectLabel` `noSentinelFontLeaks` |
| フォントを変えるとカーソルより前の文字まで変わる | `caretFontLeavesEarlierTextAlone` |
| 新しいブロックへ書式が引き継がれない(v176 で Notion に合わせ、**引き継がない**のが正しい動きになった) | `newBlockStartsWithoutFontFormat` `newBlockStartsWithoutRichFormat` `demotedBlockStartsWithoutFormat` `shiftEnterKeepsFormat` `plainBlockStaysPlain` |
| 文字サイズの表示が `Size` のままで今の値が分からない | `sizeSelectShowsCurrentSize` |
| Bold ボタンを押しても反応しない（サイズ・フォント変更の直後） | `boldWorksAfterSizeChange` `italicWorksAfterFontChange` `sizeStepperButtonsStepByOne` |
| 複数のサイズ・書体が混ざった選択でも数値や書体名が出てしまう | `mixedSelectionBlanksSizeAndFont` `uniformSelectionShowsItsOwnSize` `removedFeaturesStayGone` `crossBlockMixedBlanksToolbar` `pageWideSelectionBlanksSize` |
| 混在の判定ができていない（マウスで選ぶとツールバー操作が無反応） | `boldWorksAfterMouseDragSelection` `sizeMenuWorksAfterMouseDragSelection` `fontSelectWorksAfterMouseDragSelection` `mouseDragSelectionAcceptsTextColor` |
| 行頭からのクリック・ドラッグがブロックのつまみに取られる（Linux などで「⋮⋮」がはみ出す。v172） | `gripLeavesTextStartClickable` |
| 文字のアイコン（⋮ ▸ ☰ ← × 🗑 など）が OS のフォントではみ出す・ずれる（v174 で図形に） | `uiHasNoGlyphIcons` `blockMarkersAreShapes` `tableToolsAreShapes` `exportedIconsAreShapes` |
| 選択した部分のフォント・サイズを変えても変わらない | `tripleClickSelectionAcceptsSize` `crossBlockSelectionAcceptsSize` `crossBlockSelectionAcceptsFont` `crossBlockSelectionAcceptsBold` `doubleClickSelectionAcceptsFont` `selectAllSelectionAcceptsSize` `keyboardSelectionAcceptsBackgroundColor` |
| Bold を押すと選択範囲が変わる | `boldKeepsSelection` `partialBoldKeepsItsRange` `sizeChangeKeepsSelection` `mousePickKeepsSelection` `sizeMenuAppliesWithoutLosingSelection` |
| ブロックをまたぐ範囲を選んで Bold を押すと選択範囲が変わる(v206 からはブロックの選択が保たれる) | `crossBlockBoldKeepsSelection` `crossBlockBoldSecondPressRemoves` `crossBlockBoldKeepsBlockSelection` |
| ブロックをまたいで選んで Delete を押しても消せない(v206 でブロックの選択に。打っても入らない) | `crossBlockDragSelectsBlocks` `crossBlockTypingIsIgnored` `crossBlockTypingKeepsBlockSelection` `crossBlockBackspaceDeletesBlocks` `crossBlockUndoRestoresBlocks` `crossBlockDeleteDeletesBlocks` `crossBlockImeInputIsIgnored` `crossBlockDragLeavesNoEditableHost` `crossBlockTypingLeavesBlocksIntact` `crossBlockTypingLeavesUnmergeableBlocks` |
| 日本語入力中に複数選択して打つと1文字目だけ英字で残る（`oおおおお`） | `mouseDragKeepsEditableTarget` `crossBlockDragKeepsEditableHost` `crossBlockHostReturnsToBlock` `crossBlockBoldKeepsEditableHost` `crossBlockImeInputHasNoStrayLatin` |
| 等幅にして文字を打つとフォント設定が戻る | `osFontCaretTypingKeepsFont` `osFontSurvivesRerender` |
| フォント埋め込みで保存HTMLが重い（日本語50文字で500KB超） | `exportEmbedsOnlyChosenFonts` `noFontEmbeddedByDefault` `removedFeaturesStayGone` |
| エディタとブラウザで開いた保存HTMLの見た目が違う | `editorAndExportShareFontStack` |
| Bold がトグルになる（混在した範囲で一部だけ反転する） | `boldAppliesToWholeSelection` `boldRemovesOnlyWhenWholeSelectionHasIt` `italicAppliesToWholeSelection` `strikeAppliesToWholeSelection` |
| 本文の途中で `Enter` を押しても分割されず、空ブロックが挿入されるだけ | `enterSplitsParagraphAtCaret` `enterSplitCaretLandsAtTailStart` |
| コード/グラフ定義の中で `Enter` を押すと、改行ではなく新しい段落ブロックができる | `codeBlockEnterInsertsNewline` `chartBlockEnterAddsCommandLine` |
| ヘッダー行(th)にフォーカスできない（切替直後にフォーカス喪失・Shift+Tab で移動不能） | `tableHeaderToggleKeepsFocus` `tableShiftTabReachesHeaderRow` |
| 空にした親ブロックで `Backspace` すると子ブロックが巻き添えで消える | `emptyParentBackspaceDemotesFirst` `emptyParentBackspaceKeepsChildren` |
| 行・列の挿入削除で数式のセル参照が追随せず、計算結果が黙って変わる | `tableRowInsertKeepsFormulaTargets` `tableRowInsertKeepsFormulaChain` `tableRowDeleteShiftsFormulaRange` `tableRowDeleteRewritesFormulaText` `tableDeletedFormulaRefBecomesError` |
| 結合セルを跨いで列を挿入すると、列が行ごとに別の位置へ入り表が壊れる | `columnInsertAcrossMergeKeepsGrid` |
| 縦結合に覆われた行を削除すると、繰り上がった行のセルが結合に飲み込まれて消える | `rowDeleteUnderVerticalMergeKeepsNextRow` |
| 添付をコピー→元を削除→貼り付けると "Missing attachment" になる | `blockPasteRestoresDeletedAttachment` |
| 文書を開いた・新規作成した直後の `Ctrl+Z` で、前の文書に丸ごと巻き戻る | `undoAfterNewDocumentKeepsNewDocument` |
| タイトル欄で `Enter` を押すと改行がタイトルに入る | `titleEnterCreatesEmptyLineOnTop` |
| 保存HTMLへ `chartSvg` が無サニタイズで埋め込まれる（保存型 XSS の経路） | `savedChartSvgKeepsDrawingAndReopensClean` |
| 画像以外の添付のダウンロードボタンで添付 ID がエスケープされず、開いた文書の ID で属性の外へ出られる（v144） | `attachmentIdEscapedInExport` `openedAttachmentIdsAreNormalized` |
| ブラウザ版 `Ctrl+S` の上書き保存が失敗しても何も表示されない | `fileHandleSaveWorks` `fileHandleSaveFailureWarns` |
| Undo/Redo でキャレットが先頭ブロックへ飛ぶ・履歴が1打鍵ごとに積まれる | `undoCoalescesTypingBurst` `undoReturnsCaretToEditedBlock` `redoRestoresCoalescedBurst` |
| 空のトグルで `Enter` を押しても段落に戻らず、空のトグルが増え続ける | `emptyToggleEnterReturnsParagraph` `emptyToggleBackspaceReturnsParagraph` |
| 表の最終セルで `Tab` を押すと先頭セルへラップする（行が追加されない） | `tableTabAtEndStillMovesToNewRow` `tableFirstCellShiftTabStays` |
| グラフより上に表が無いと、文書の最初の表へ黙ってフォールバックする | `chartWithoutTableAboveShowsError` |
| 表のセルで `Enter` を押すと表の外に空段落が増え、フォーカスが奪われる | `tableCellEnterMovesToRowBelow` `tableCellEnterAddsNoBlock` `tableCellEnterLastRowStays` |
| 保存した単一HTMLで、数式セルが計算結果ではなく生の式で表示される | `exportedFormulaCellUnderlined` `lowFixFullWidthStoredTextKept` |
| 目次から、閉じたトグルの中の見出しへ移動できない | `tocKeepsHiddenHeadingListed` `tocClickOpensClosedToggle` `tocClickFocusesHiddenHeading` |
| 複数行テキストの貼り付けで、行の区切りが失われて1行に潰れる | `multilinePasteKeepsLineBreaks` `multilinePasteSurvivesRerender` |
| 親の無い番号付きリストをインデントすると `1.1` と採番される | `orphanIndentedNumberStartsAtOne` |
| 貼り付けた複数行の段落が、保存した単一HTMLでは1行に潰れる | `exportedParagraphKeepsLineBreaks` |
| 子ブロックを持つブロックをドラッグ移動すると、子が置き去りになる | `dragMovesSubtreeTogether` |
| 表のセル内で書式ツールがサイレントに無反応 | `cellEditingDisablesFormatTools` `formatToolsReenableOutsideTable` |
| コードブロックの Tab がコードの字下げではなくブロックの字下げになる | `codeTabInsertsIndentCharacter` |
| 本文の途中で Tab を押しても、タブで文字の位置をそろえられない(v176。先頭ならインデント) | `tabAtBlockStartIndents` `shiftTabAtBlockStartOutdents` `tabMidTextInsertsTab` `tabStopsAlignText` `tabSurvivesExport` |
| Ctrl+Home / Ctrl+End で文書の端へ移れない(v176) | `ctrlHomeGoesToDocumentStart` `ctrlEndGoesToDocumentEnd` |
| トリプルクリックで選んだ段落(最後でないブロック)で ← → も文字入力も効かない(v204) | `tripleClickStaysInBlock` `tripleClickArrowRightGoesToEnd` `tripleClickArrowLeftGoesToStart` `tripleClickTypingReplacesBlockOnly` |
| 複数のブロックを選んでつまみでドラッグしても1つしか動かない(v210。選んだブロックを子ごとまとめて動かす・選んだまま・Undo 1回) | `groupDragMovesAllSelected` `groupDragKeepsSelection` `groupDragUndoesInOneStep` `groupDragMovesUp` `groupDragOntoSelectionIsNoop` `ungroupedGripMovesOnlyItself` |
| 文字をドラッグで選んで本文の外(下の余白・自動スクロールの先)で離すと選択が消える(v212) | `dragReleasedInBlankKeepsSelection` `mouseDragSelectionAcceptsTextColor` |
| ブロックをまたぐ選択(ドラッグ)で ← → が何も起こさない(v204。v206 からはブロックの選択の最初の頭/最後の末へ) | `crossBlockArrowRightGoesToEnd` `crossBlockArrowLeftGoesToStart` `crossBlockArrowSkipsEmptyEdge` |
| ページのブロックを Tab で上のページの子にできない(v206) | `pageTabNestsUnderPageAbove` `pageTabUndoRestores` `pageShiftTabMovesToParent` |
| ブロックを選んだまま書式を当てられない(v206。ブロックの文字全部に当たる) | `blockSelectionCtrlBBoldsWholeBlock` `blockSelectionToolbarColorAppliesToBlock` `blockSelectionResetClearsWholeBlock` `blockSelectionIgnoresTyping` `crossBlockSelectionAcceptsSize` `crossBlockSelectionAcceptsFont` |
| 空のブロックすべてに「Type / for commands」が出る(v206。カーソルのある所だけに) | `placeholderOnlyOnFocusedEmptyBlock` |
| ＋ボタンで種類のメニューが開く(v206。段落を足すだけに) | `plusAddsParagraphWithoutMenu` `plusParagraphTakesPlainText` `plusParagraphAcceptsSlashCommand` |
| 埋め込みフォントを消せない(v176) | `fontRowHasDeleteButton` `deletingFontRemovesEmbed` `deletingFontResetsTextToDefault` `deletedFontNotSaved` `deletingFontCanBeUndone` |
| デスクトップ版(exe)で添付のダウンロードが「機能しない」(実際は黙ってダウンロードフォルダへ保存され、知らせが見えなかった)。v189 で exe は「名前を付けて保存」の画面で保存する | `desktopAttachmentUsesSaveDialog` `desktopAttachmentSkipsBrowserDownload` `desktopAttachmentCancelIsQuiet` |
| PDF・印刷で好きな位置で改ページできない。v191 で「改ページ」ブロック(/pagebreak・/改ページ)。エディタは点線と「改ページ」の文字、保存HTMLの画面には何も出さず、印刷で次の紙へ。形式 0.8.3 | `pageBreakInsertedFromSlash` `pageBreakHiddenOnScreen` `pageBreakBreaksWhenPrinted` `pageBreakRoundTrips` `pageBreakRemovedByBackspace` |
| 本文の URL にリンクを付けられない。v200 でリンクのボタン(付ける・書き換える・外す)。v202 から自動で付くのは URL だけを貼り付けたときだけ(打った・書いてある URL は文字のまま。外したリンクは描き直しで戻らない)。行き先は http・https・mailto だけ。エディタは Ctrl+クリック、保存HTMLは別のタブ、exe は既定のブラウザで開く。形式 0.8.7 | `linkTypedUrlStaysText` `linkPastedUrlBecomesLink` `linkMixedPasteStaysText` `linkRemovedStaysRemoved` `linkButtonRefusesUnsafe` `linkButtonAddsLink` `linkUndoRedo` `linkCtrlClickOpens` `linkPointerWhileCtrl` `linkRemoveKeepsText` `linkSavedOpensNewTab` `linkSavedIsSafe` `desktopLinkOpensInBrowser` |
| 題名が見出しと見分けにくい・今どのページの下にいるか分からない。v201 で題名から上を薄い灰色に。v207 でページの場所をメニューの下の1行に「… › 親 › 自分」(クリックで移る。保存HTMLも ☰ ← → の下の1行)。題名の上の親のページ名は消した | `crumbHiddenForSinglePage` `pagePathShowsParentAndSelf` `pagePathCollapsesHigherAncestors` `pagePathReplacesTitleCrumb` `crumbShowsAncestorsAndNavigates` `pagePathFollowsTitleEdit` `titleBandIsGray` `savedCrumbLinksToAncestors` `savedTitleBandIsGray` |
| タイトルの末尾で Enter を押すと、先頭の文の末尾へ移ってしまう(v187。本文の一番上に空の行を作ってそこへ移るように。Notion と同じ) | `titleEnterCreatesEmptyLineOnTop` `titleEnterDoesNotStackEmptyLines` `titleEnterNewLineUndoable` |
| 済んだ ToDo に、エディタでは取り消し線が付かない(v188。保存HTMLの .todo.done と同じく取り消し線と薄い色に。Notion と同じ) | `todoDoneIsStruckThrough` `todoDoneStrikeFollowsUndo` |
| ブロック選択中に Tab を押してもまとめてインデントできない | `selectedBlockTabIndentsOnlyThatBlock` `deepIndentSelectedTabStepsOne` |
| Tab で字下げすると、下にぶら下がるブロックまで一緒に下がる(v211。そのブロックだけに。閉じたトグルは子ごと) | `tabIndentsOnlyThatBlock` `shiftTabOutdentsOnlyThatBlock` `selectedBlockTabIndentsOnlyThatBlock` `closedToggleTabCarriesChildren` |
| 字下げの上限が場所ごとに違い(Tab 6 段・開くとき 20 段・貼り付けとドラッグは上限なし)、7 段以上で Tab がおかしい・21 段以上を保存すると開き直したときに形が変わる(v259。#139。上限は文書全体で 20 段の1つ `fmt.MAX_INDENT`。Tab は 1 段ずつ) | `deepIndentSelectedTabStepsOne` `deepIndentCaretTabStopsAtLimit` `deepClosedToggleTabCarriesChildren` `deepPasteStaysWithinLimit` `deepDragStaysWithinLimit` `deepNumberedMarkers` |
| AI が保存HTMLを全部読まないと中身が分からない(重い)。v226 で中身の JSON を先頭へ・図の絵の重複をやめ・計算結果と番号を添えた(形式 0.8.9) | `aiLayoutNoteAtTop` `aiManifestBeforeStyleAndBody` `aiManifestHasNoDiagramPictures` `aiDerivedTableValuesMatchView` `aiDerivedLabelsMatchView` `aiDerivedHeadingNumbersMatchView` `aiOpenDropsDerivedAndTakesPicturesFromBody` `aiForgedDerivedIsRecomputed` `aiOldFormatWithPicturesInManifestOpens` `aiBodyPictureWithHtmlPartsSurvives` `aiDerivedValuesForFullWidthFormulas` `aiManifestTablesAreNormalized` |
| 行の多い表でセルを押すと、行数の 2 乗で遅くなり画面が固まる(v261。#146。1000 行で約 5 秒。表の印を「測る → 足す」の交互で作り、行ごとに全セルを探していた。先に全部測ってまとめて足す) | `bigTableClickDoesNotRelayoutPerRow` `bigTableClickIsFast` `bigTableMarksStillComplete` |
| 表のリンク(データベースのリンクの列)を Ctrl+クリックしても開かない(v236。押した時点でセルが編集の形に描き替わっていた) | `tableLinkCtrlClickOpens` `tableLinkCtrlClickOtherDocNotifies` `tableLinkPlainClickEdits` |
| デスクトップ版で、表の別の文書へのリンクを Ctrl+クリックしても知らせが出るだけ(v236。Monolio の中で開く) | `desktopLinkMissingNotifies` `desktopLinkAsksBeforeDiscarding` `desktopLinkOpensLinkedDocument` `desktopLinkSavesToLinkedDocument` |
| 行の右の余白を押すと、どの行でも文書の最後のブロック(表の末など)へ飛ぶ(v215。その行の末尾へ) | `sideClickFocusesThatRow` `sideClickOnTableRowFocusesThatTableRow` `clickBelowLastRowStillGoesToEnd` |
| 自分の子の下へドラッグしても移動できない(落とし先の線は出るのに何も起きない。v211 でそのブロックだけが移る) | `dragIntoOwnChildMovesOnlyThatBlock` `dragIntoOwnChildUndoRestores` |
| 選択中のブロックが Backspace では消せない（Delete のみ） | `selectedBlockBackspaceDeletes` |
| コードブロックで Shift+Tab しても行の字下げが戻らない | `codeShiftTabRemovesLineIndent` |
| ブロック選択中に ↑↓ を押しても選択が隣へ移らない | `selectedBlockArrowMovesSelection` |
| ブロック選択中に Enter を押しても編集に入れない | `selectedBlockEnterEntersEditing` |
| 区切り線の直後の先頭 Backspace で区切り線を消せない | `backspaceAfterDividerRemovesIt` |
| 見出しに太字を押すと逆に細字化される（ボタンも常時点灯） | `headingBoldAddsBold` `headingBoldTogglesOffCleanly` `headingCaretDoesNotLightBold` |
| 全選択+太字で見出しだけ太字にならない | `selectAllBoldsHeadings` |
| 段組み化ドラッグで子ブロックがカラムの外に置き去りになる | `columnDragMovesSubtree` |
| トグルの中の段組みが、閉じても隠れない・保存HTMLでトグルの外に出る・トグルを動かすと置き去りになる(v256。Issue #133) | `closingToggleHidesColumnsInside` `savedHtmlKeepsColumnsInsideToggle` `movingToggleCarriesColumns` |
| 見出しの途中分割で後半が段落に降格する | `headingSplitKeepsHeadingType` `headingEnterAtEndCreatesParagraph` |
| 言語付きコードフェンス(```js)の言語名が本文に残る | `fenceLanguageAtEndIsDropped` |
| 検索バーが初期表示から出っぱなしで、Esc や × で閉じても消えない（hidden 属性が author 側の display 指定に負ける） | `searchBarHiddenByComputedStyle` |
| セル内 `↓` で表の右下(最後)のセルへ移動すると、セルに入らず表の下のブロックへ抜ける（`↑` も空の先頭セル(0,0)で同様。keydown の伝播で moveAcrossBlocks が二重に働く） | `tableArrowDownIntoLastCellStays` `tableArrowUpIntoEmptyTopCellStays` |
| 空の数式ブロックのプレースホルダが1文字ずつ縦一列に表示される（.math-canvas に grid-column 指定が無く、.block の 40px ガター列に自動配置されて幅が潰れる） | `mathPlaceholderIsHorizontal` |
| インライン数式・インラインコードのソース内で先頭・末尾に立てない、行末尾から ← でキャレットが変な動きをする、編集中にキャレットが文字に被る（ZWSP+ミラー構造+シェーピングの対症療法が続いたため、v104 で**チップ方式へ作り直し**: 編集中の範囲は本当にただのテキストになり、プレーン段落と同一DOMなので視覚バグは原理的に出ない） | `inlineMathCaretReachesBothEnds` `inlineCodeCanInsertAtStart` `inlineSourceMatchesPlainTextMetrics` |
| 旧構造(v102以前、data-tex なし)のインライン数式を含む文書を保存すると、出力単一HTMLの本文で数式が空の `$$$$` に化ける（New-21。document-format.js の sanitize 数式ブランチだけ旧構造フォールバックが無かった — コードブランチとの非対称） | `legacyInlineHtmlExportsMath` |
| ブロック数式のソースをクリックしても、クリックした位置にキャレットが立たない（New-22。ソース開閉が :focus-within 駆動で、クリック時の静的選択モードのフォーカス移動でソースがクリック中に1pxへ畳まれていた → .source-open クラス駆動に変更。プレビューの「常に末尾へ」も位置対応に修正） | `mathBlockSourceClickPlacesCaret` `mathBlockCanvasClickEntersAtPosition` |
| クリック押下中にブロック全体を囲むオレンジの広い枠が出る（New-23。静的選択モードで #blocks 自身が contenteditable+focus になり、UA 既定のフォーカスリングが描かれていた → `.blocks[data-static-host] { outline: none }` で抑止。キーボードのフォーカス可視性には触れない） | `staticHostShowsNoFocusRing` |
| 添付の記録(sha256)が中身と合わないファイルが、開けるのに二度と保存できない(v247。Issue #111) | `attachmentMismatchOpensWithWarningAndSaves` `attachmentUppercaseShaIsAccepted` `attachmentWrongSizeIsCorrected` |
| `<font face>` で埋め込みフォントを指すファイルを保存すると、フォントが消える(v247。Issue #112) | `fontFaceKeepsEmbeddedFont` |
| Ctrl+A 2回のあとの日本語入力で題名が上書きされる(v247。Issue #88) | `pageSelectImeKeepsTitle` `pageSelectImeTypesWhereCaretWas` |
| 行・列のドラッグで、表の外まで伸びた範囲の式が NaN に壊れる(v247。Issue #80) | `lineMoveKeepsRangesBeyondTable` |
| Undo のあと見えないセルの範囲が残り、Delete で見えていないセルが消える(v247。Issue #117) | `undoKeepsRangeVisible` `undoRangeIgnoresKeysOutside` |
| 範囲にエラーのセルがあると COUNT・COUNTIF・SUMIF までエラーになる(v248。Issue #81) | `tableCountSkipsErrorCells` |
| 式の中の #REF を IFERROR・IF で受け止められない(v248。Issue #82) | `tableIfErrorCatchesRef` |
| 100万を超える小数の結果に誤差が見える(v248。Issue #83) | `tableLargeDecimalHasNoNoise` |
| 0.1+0.2=0.3 が FALSE になる(v248。Issue #84) | `tableCompareUses15Digits` |
| 逆向きの範囲(A$3:A1)の $ が挿入のあと反対の端へ移る(v248。Issue #85) | `tableReversedRangeKeepsAbsolute` |
| =.5・=1E3・空の引数が #ERR になる(v248。Issue #86) | `tableNumberFormsAndEmptyArgs` `tableExponentNotRewrittenAsRef` |
| ブロックの頭の Tab でキャレットが末尾へ飛び、2回目の Tab でタブ文字が入る(v249。Issue #89) | `tabIndentKeepsCaret` |
| 表のセルで変換中の Tab(Mac 型)で文字が2つのセルに分かれる(v249。Issue #90) | `tableTabDuringImeStaysInCell` |
| Shift+Enter 直後の空の行から ↓ / → / Delete で進めない・繋ぐと改行が増える(v249。Issue #92) | `shiftEnterEmptyLineMovesOn` `shiftEnterDeleteJoinsWithOneNewline` `reopenedTrailingNewlineDeleteJoins` |
| ページのブロック・目次の前後で矢印キーが止まる(v249。Issue #93) | `arrowsSkipPageAndTocBlocks` |
| ↓↑ で1行のブロックごとに2回押す・横の位置が保たれない(v249。Issue #94) | `arrowDownUpOnePressPerLine` `arrowDownUpKeepsColumn` |
| 何も消えない Backspace / Delete で Redo が消える(v249。Issue #118) | `noopDeleteKeepsRedo` |
| 全画面の「2行を挿入」が Ctrl+Z 1回で戻らない(空の1手のあと・履歴が上限)(v249。Issue #119) | `sheetInsertUndoOneStep` |
| Web の表・スプレッドシートの1行を貼るとセルの区切りが消える(v250。Issue #91) | `pasteTabbedRowKeepsTabs` |
| 外から複数のブロック分(見出し・リスト・表など)を貼ると、文字が1つのブロックの中に改行つきで入る(v263。#141。HTML をブロックに分けて貼る。1つの段落・1行の表・コード/セルの中は今までどおり) | `htmlPasteSplitsBlocks` `htmlPasteUndoIsOneStep` `htmlPasteTodoQuoteCodeTable` `htmlPasteToggleCarriesChildren` `htmlPasteGoogleDocsParagraphs` `htmlPasteOneLineStaysInline` `htmlPasteIntoCodeAndCellStaysText` `htmlPasteDropsUnsafe` `htmlPasteKeepsTargetIndent` |
| 貼り付けで要らない書式が付く・太字や斜体が消える・HTML のコメントが文字になる(v250。Issue #96) | `pasteInAppCopyDropsContextStyle` `pasteInAppCopyKeepsBold` `pasteInAppCopyKeepsUserSize` `inlineCutIsOneUndoStep` `pasteGoogleDocsKeepsBoldItalicColor` `pasteHtmlCommentIsDropped` |
| 題名の欄に貼ると改行や書式が入る(v250。Issue #95) | `pasteIntoTitleIsOnePlainLine` |
| 文中にページへのリンクを入れられない(v276。Issue #174。保存形式 0.8.18) | `mentionMenuListsPages` `mentionMenuFilters` `mentionInsertsPageChip` `mentionTypingContinuesAfterChip` `mentionUndo` `mentionMidTextAndFullWidth` `mentionRanksStartsFirst` `mentionNotForEmailOrNoHit` `mentionEscapeKeepsText` `mentionFollowsRename` `mentionClickOpensPage` `mentionSavedAsLink` `mentionSavedLinkOpensPage` `mentionDeletedPageIsMissing` `mentionNoPageErrors` |
| 文の書式に下線が無い(v274。Issue #172。保存形式 0.8.17) | `underlineButtonToggles` `underlineUndoOneStep` `underlineCtrlU` `underlineLinkNotActive` `underlineSelectedBlockCtrlU` `underlineDisabledInCell` `underlinePasteKeeps` `underlineSavedAndReopened` `underlineNotionPaste` `underlineNoPageErrors` |
| 拡大表示で拡大・縮小・100%・移動ができない。Mermaid の図・グラフ・保存HTMLには拡大表示が無い(v271) | `zoomImageOpensFitted` `zoomImageWheelZoomsAtCursor` `zoomImageDragPans` `zoomImageDoubleClickToggles` `zoomImageButtonsAndKeys` `zoomImageBackdropCloses` `zoomNarrowToolbarFits` `zoomChartOpens` `zoomChartWheelZooms` `zoomChartClosesClean` `zoomMermaidOpensAndZooms` `zoomSavedImageZoomsAndPans` `zoomSavedChartAndDiagram` `zoomRuntimeOnlyWhenNeeded` `zoomNoPageErrors` |
| 拡大表示がスマホの2本指のピンチに対応していない(Issue #258。v297)。指の間を中心に拡大・縮小、2本指のままの移動、ピンチの後に閉じない | `zoomEditorPinchZoomsAtMidpoint` `zoomEditorPinchPans` `zoomEditorPinchLimitsSameAsWheel` `zoomEditorPinchDoesNotClose` `zoomEditorOneFingerStillDrags` `zoomEditorViewerBlocksPagePinch` `zoomPagePinchUntouchedAfterClose` `zoomSavedPinchZoomsPansAndLimits` `zoomSavedPinchDoesNotClose` `zoomSavedViewerBlocksPagePinch` `zoomSavedPagePinchUntouchedAfterClose` |
| Notion でコピーしたブロックを貼ると、1つの段落の文字になる(v265。Issue #141。Notion の形 → HTML(v263 の土台) → 文字の順に読む。入口は1つ) | `notionPasteKeepsBlockShape` `notionPasteShowsBlocksOnScreen` `notionPasteKeepsTodoCheck` `notionPasteKeepsCodeAndMath` `notionPasteKeepsTable` `notionPasteKeepsInlineFormat` `notionPasteKeepsInlineMath` `notionPasteKeepsColors` `notionPasteCalloutKeepsIcon` `notionPasteUndoesInOneStep` `notionPasteAfterSelectedBlock` `htmlPasteMakesBlocks` `htmlPasteReadsTodoMarks` `htmlPasteSplitsItemParagraphs` `htmlPasteReadsMathParagraph` `webHtmlPasteMakesBlocks` `webHtmlPasteNotesImage` `htmlPasteOneLineStaysInline` `sheetRowsBecomeTable` `htmlPasteIntoCodeAndCellStaysText` `foreignPasteIsSanitized` |
| ブロックをコピーして表のセルに貼るとブロックの HTML が入る(v250。Issue #98) | `pasteIntoCellIsPlainText` |
| 行末に改行のある段落を置換すると見えない改行が増える(v250。Issue #97) | `replaceKeepsTrailingNewlineCount` |
| 番号リストで「数字. 」と打つともう一度変換されて文字が消える(v250。Issue #99) | `markdownShortcutSkipsSameType` |
| 表の全画面で Ctrl+F を押すと見えない検索欄が開き、文字がセルに入る(v251。Issue #102) | `focusFindOpensVisibleSearch` |
| 親へ戻るリンクで Shift+Tab を押すと親の中に自分自身へのリンクができる(v251。Issue #103) | `pageLinkShiftTabNoSelfLink` |
| パレット・メニューが開いたまま検索欄・パレットと重なる(v251。Issue #106) | `popoversCloseWhenFindOrPaletteOpens` |
| AI 用の写しの値が数の見せ方を付けたセルで画面と違う(v251。Issue #113) | `derivedValuesMatchShownFormat` |
| pages が空のファイルを開くと段落にスクリプトが入る(v251。Issue #115) | `emptyPagesFileHasNoScriptText` |
| コードブロックのゼロ幅スペースが編集で消える(v251。Issue #116) | `codeKeepsZeroWidthSpace` |
| ブラウザのメニューから印刷すると本文が 40px の列に詰め込まれる(v252。Issue #101) | `browserPrintKeepsBodyWidth` |
| 「戻る」で戻ると上に画像があるときスクロールの位置がずれる(v252。Issue #104) | `pageBackRestoresScrollWithImage` |
| 狭い画面でメニューが右へはみ出す(v252。Issue #107) | `narrowMenusStayInView` |
| グラフの長い題名・軸の名前が枠の外へ出て切れる(v252。Issue #108) | `chartLongTitleFitsWithEllipsis` |
| 保存HTMLで空白の無い長い語が右で切れる(v252。Issue #114) | `savedHtmlWrapsLongWords` |
| 見出しの番号・図表の番号・印刷のページの順がページ一覧の並びと違う(v253。Issue #105) | `headingNumbersFollowPageTree` `figureNumbersFollowPageTree` `savedPagesFollowPageTree` |
| Ctrl+A 2回の選択で Delete・Backspace・Ctrl+X が効かない(v254。Issue #100 a) | `pageSelectDeleteRemovesAllBlocks` `pageSelectCutAndCopyAreBlocks` |
| キーボードでブロックをまたいで選べない(v254。Issue #100 b) | `keyboardSelectionCrossesBlocks` `keyboardSelectionWithinBlockStaysNormal` `keyboardSelectionCutAndPaste` |
| リンクの途中から外へ伸ばした範囲にリンクを付けても伸ばした部分に付かない(v254。Issue #100 c) | `linkExtendedRangeBecomesOneLink` |

## 基本編集

- 段落ブロックに本文を入力できる
- ブロックの端で左右キーを押すと、隣のブロックへ移る
  - 先頭で左キー → 前のブロックの末尾
  - 末尾で右キー → 次のブロックの先頭
  - 何も書いていない新規ブロックでも行き止まりにならない（空ブロックも1回分の立ち寄り先になる）
  - 文字の途中では従来どおり1文字ずつ動く
  - 先頭ブロックの先頭、最後のブロックの末尾では何も起きない
  - `Shift+左` `Shift+右` は選択を伸ばす動作のまま（横取りしない）
  - テーブルのセルなど入れ子の編集領域からは動かさない
- `Enter` で次のブロックを作れる
  - 本文の途中で押すと、キャレット位置で前後のブロックに分割される（書式ごと）。キャレットは後半の先頭へ移る
  - コードブロック・グラフ定義の中では改行になる（ブロックは増えない）
  - タイトル欄では改行にならず、本文の先頭ブロックへ移る
  - 表のセルの中では下の行の同じ列へ移る（表の外にブロックは作られない。最終行では何もしない）
- `Enter` で新しいブロックへ移っても、直前の書式(太字・斜体・取り消し線・色・フォント・文字サイズ)は
  **引き継がない**(Notion と同じ。v176 ユーザー指示。以前は引き継いでいた)。途中で分割したときに
  後ろへ移る文字は、その文字自身の書式のまま
- 引き継ぎ用の目印(幅ゼロの文字)は、文字を入力すると本文に残らない
  (v104 からインラインコード/数式は ZWSP を使わないため、それらのあるブロックも掃除対象)
- 空のリスト項目で `Enter` を押して段落へ戻る場合も、書式は引き継がない
- `Shift+Enter` のブロック内改行でも書式が続く
- 書式のないブロックからの `Enter` では、余計な装飾要素が残らない
- 空の箇条書き、番号付きリスト、チェックボックス、トグルで `Enter` を押すと、普通の段落に戻る
- 空の箇条書きで `Backspace` を押すと、ブロック削除ではなくバレットだけ外れて普通の段落に戻る
- 空の番号付きリストで `Backspace` を押すと、ブロック削除ではなく番号だけ外れて普通の段落に戻る
- 空のチェックボックスで `Backspace` を押すと、ブロック削除ではなくチェックボックスだけ外れて普通の段落に戻る
- 空の通常ブロックで `Backspace` を押すと、そのブロックを削除して一つ手前のブロックへ移動できる
- ブロック末尾 `Delete` で次のブロックを結合（行頭 `Backspace` の鏡。P25）
  - 「改行を消したので次の文がカーソル位置に来る」動き。全ブロック種別で効く一般規則
  - 結合後の種別は**残る側（手前のブロック）**を維持し、キャレットは繋ぎ目に残る。Undo 1手
  - **結合の核は1つ**（`mergeBlockPair`）。行頭 Backspace は `(前, 自分)`、行末 Delete は
    `(自分, 次)` で同じ核を呼ぶ。制約（構造ブロックとは繋がない／段組みをまたがない／
    消える側が子を持つなら触らない／`visibleBlocks()` 基準）は核が1箇所で持つ
  - **Delete 側だけの追加ガード**: 自分が子を持つ場合も不発（このとき「次の可視ブロック」は
    自分の子であり、繋ぐと階層が壊れる。鏡は完全な対称ではない）
  - 表・コード・グラフ・数式・添付・区切り線とは繋がない（中身が寄せ集めテキストにならない）
  - 表のセルの中の Delete はセル内で完結し、ブロック層へ漏れない（New-27 の教訓）
  - 文書末尾では何も起きない。文字の途中では従来どおり1文字だけ消える
  - **Backspace で繋いだ結果と Delete で繋いだ結果が一致する**ことをテストで固定
    （`backspaceAndDeleteMergeAgree`。片方だけ直してずれる事故を防ぐ）
  - （`deleteMergesNextBlock` `deleteMergeKeepsCaretAtJoin` `deleteMergeUndoIsOneStep`
    `deleteMergeKeepsCurrentType` `deleteInsideTextRemovesOneChar` `deleteDoesNotMergeSpecialBlock`
    `deleteDoesNotMergeCodeBlock` `deleteKeepsBlocksWithChildren` `deleteKeepsOwnChildren`
    `deleteAtDocumentEndDoesNothing` `deleteInsideTableCellStaysInCell` `backspaceAndDeleteMergeAgree`）
  - 子ブロックを持っていても子は消えず、インデントを1つ戻して残る
- 画面上が空のブロックなら、内部データが古い内容を持っていても `Backspace` でブロックを削除できる
- `1. ` で番号付きリストへ変換した直後に `Enter` を押すと、`1. ` が本文に残らず普通の段落に戻る
- `- ` で箇条書きへ変換した直後に `Enter` を押すと、`- ` が本文に残らず普通の段落に戻る

## 複数ページ(Step 2: 実体とナビゲーション)

- `/page` で子ページを作り、その位置にページへのリンクが残り、新しいページへ移る
  (「設計メモ /page」と打てば題名は「設計メモ」)
- **左のページ目次**: 親の下に子を字下げして全階層を常に表示。**今いるページは強調**
  (複数の場所に出ていればそのすべて)。☰ で畳める。狭い画面(900px 以下)ではオーバーレイで、既定は閉じている
  (閉じているときは ☰ が常に見えて押せる。開いたオーバーレイは**外側のタップか Escape で閉じる**)
- **目次の幅は右端の境目をドラッグで変えられる**(v199。160px〜600px か画面の半分。ダブルクリックで 240px、←/→ でも)。
  幅は次に開いたときも覚えている。名前が「…」で切れているときは、マウスを乗せると全文が出る。保存HTMLの目次も同じ(幅は覚えない)
  → `pageTreeWidthSuite`
- **いま読んでいる所の見出し**(v205): スクロールで見出し1〜3が上へ隠れると、ツールバーの下に「見出し1 › 見出し2 › 見出し3」が1行で出る。
  一部でも見えている見出しは載せない・見出し4/5は載せない・長い名前は「…」で1行・押すとその見出しへ戻る。View → Sticky headings で入/切(覚える)。
  保存HTMLにも同じ帯(見出し1〜3がある文書だけ。印刷には出ない) → `headingPathSuite`
- **本文の幅**(v260): 表示 → 本文の幅… の窓のスライダーで変える(標準 920px。600px〜画面いっぱい)・「標準に戻す」「画面いっぱい」・開き直しても覚える
  (この画面の好み。localStorage)・保存した HTML には入らない・Esc と外のクリックで閉じる
  → `contentWidthDefaultIs920` `contentWidthSliderChangesAndRemembers` `contentWidthFullAndReset` `contentWidthPopoverCloses` `contentWidthNotSaved`
  - 帯より長い見出し1つや、ごく短い親の下の長い見出しでも、帯の右端からはみ出さない(v224。書体の幅によらず確かめる)
    → `headingPathStaysOneLine` `headingPathLongAloneFits` `headingPathShortParentFits` `savedHeadingPathLongAloneFits` `savedHeadingPathShortParentFits`
  - ページの場所の行(「… › 親 › 自分」)も、長い題名で行の右端からはみ出さず「…」で詰まる(v224。エディタと保存HTML)
    → `pagePathLongTitleStaysInRow` `savedPagePathLongTitleStaysInRow`
- 目次のページ名・本文のページリンクを押すと、そのページへ移る
- **題名は各ページが独立して持つ**。画面上部の題名欄は今いるページの題名を編集し、ほかのページの題名は変わらない。
  保存ファイルの名前(`<title>`・ファイル名)は**先頭ページの題名**になる
- **ページを移っただけでは未保存にならない**(開き直しても破棄の確認が出ない)
- **ページの戻る/進む**(ツールバー左端の ← / → ボタン。キーボードやマウスの戻るボタンには割り当てない)
  - A→B→C と移って 戻る×2 で A、進むで B。戻った状態で D へ移ると、進むは押せなくなる
  - 戻る/進むで来たページは、最後に見ていた位置(スクロール・キャレット)に戻る
  - 戻る/進むでは未保存にならず、Undo の履歴も増えない。Undo でページが切り替わっても移動の履歴には積まない
  - ただし Undo で切り替わった先に合わせて「戻る/進む」の位置も動く: A 編集 → B → Undo(A 表示)→ 進むで B へ行ける。
    今いるページを削除 → Undo でそのページへ戻ったら、戻るはちょうど1つ前のページへ行く(飛ばさない)
  - ファイルを開く・新規作成で移動の履歴は空になる(戻るが押せない)。行き先が無いボタンは薄く表示され押せない
- A を編集 → B へ移動 → **Undo で A に戻って変更が消える**。そのあと B へ移って **Redo すると A に戻って変更が戻る**
- ページ作成を Undo すると、ページが消えて先頭ページへ戻る
- 保存して開き直すと、全ページとリンクが残る。**ページ B を見たまま同じファイルを開き直すと、先頭ページで開く**
- **目次には、どんなリンク構造でもすべてのページが1回以上出る**
  - **ルートは先頭ページだけ**。先頭ページから辿れないページ(どこからもリンクされないページも)は「未分類」に出る
  - 目次の最上位は先頭ページ(ホーム)1つで、その下に階層が出る
  - 未分類の中は、未分類の中でどこからもリンクされないページが頭になり、その下に子が出る
  - 未分類の中の循環ペア(P↔Q)は頭が1つだけ(相手はその下。戻りのリンクは薄い字の葉で出る)
  - 親が2つあるページは両方の下に出る(2回目は中を開かない)
  - 同じページの中に同じ子ページへのリンクが2つあっても、目次ではその親の下に1回だけ出る
  - 自己リンクだけのページ・外から切れた循環ペアも「未分類」に出る(目次から消えない)
  - **先頭ページは常にルート**(子からリンクし返されても「未分類」に入らない。文書の入口を見失わないため)
- ページブロックを本文から消しても、ページ自体は消えない(目次に残る。消せるのは目次の「削除」だけ)
- **ページの削除**(目次のページ名の横の ⋯、または右クリック →「削除」)
  - **先頭ページには ⋯ が出ず、右クリックしてもメニューが出ない**(削除できない)
  - 確認ダイアログが出る: 「このページを削除しますか(子ページ K 件は未分類に移ります。
    他のページの N 箇所のリンクも取り除かれます)」。K は先頭から辿れなくなるページの数(ほかの親から辿れる子は
    数えない)。K=0 なら前半、N=0 なら後半は出ない。**キャンセルすると何も変わらない**
  - **子ページは消えない**(先頭から辿れなくなった子は「未分類」に出る。ほかの親があればそのまま)
  - 削除したページへのリンクは**全ページから**消える。リンクの下に字下げしてあった本文は残る
  - 今いるページを消すと、移動の履歴で1つ前のページへ移る(無ければ先頭ページ)。「戻る」と同じ扱いで、
    消したページは進む側に残る(削除中は進むで飛ばされる)。Undo のあと、別ページへ戻ってから進むでそのページへ行ける
  - **Undo 1回**でページ・リンク・添付がすべて戻り、消したページへ戻る。添付も開ける
  - 戻る/進むは消したページを飛ばす。Undo でページが戻れば、また辿れる
  - 検索バーを開いたまま消しても、検索結果が消えたページを指したまま残らない
  - 狭い画面(目次がオーバーレイ)でも ⋯ のメニューは目次の上に出て押せる。押しても目次は閉じない
- 同じファイルを2回続けて開けること(以前は2回目が無反応だった)
- **Step 1 の版(形式 0.8.0)で保存したファイルを開いても題名が残る**(題名欄と目次に本当の題名が出て、
  保存し直しても消えない)。保存形式は 0.8.1 になる

## 保存HTMLの複数ページ(Step 4)

- 2ページ以上の文書を保存したHTMLを開くと、**最初は先頭ページだけ**が見え、左にエディタと同じページ目次
  (全階層・今いるページの強調・未分類)が出る
- 目次のページ名・本文のページリンクを押すとそのページへ切り替わる。左上の ☰ ← → はエディタと同じ
  (← → は戻る/進む。行き先が無ければ押せない)
- 狭い画面では目次がオーバーレイになり、☰ で開く。外側のタップ・Escape・ページを選ぶと閉じる
- **スクリプトが動かない環境**(スクリプト無効・一部のプレビュー)では、全ページが縦に並ぶ従来の表示のまま読める。
  目次は本文の上にリンクの箱として出て、押すと縦に並んだそのページへ飛ぶ(← → のバーは出ない)
- ページの題名に `<img src=x onerror=…>` のような文字列があっても、保存HTMLではそのまま文字として出る(実行されない)
- **印刷すると全ページ**が出る(2ページ目以降は改ページ。PDF として保存も同じ)。目次と ← → は印刷されない
- **1ページの文書を保存したHTMLは従来と同じ**(目次もボタンも出ない)
- ブラウザで保存HTMLを直接開いて(file://)動く
- 対応するテスト: `portableTreeMatchesEditor` `portableShowsFirstPageOnly` `portableTreeAndLinkSwitchPages`
  `portableBackForward` `portableRuntimeHasNoErrors` `portableNarrowTreeIsOverlay` `portableWorksWithoutScript`
  `portableSinglePageUnchanged` `portableEscapesPageTitles` `portablePrintsEveryPage` `portableSinglePageMatchesStep3Output`

### 複数ページの暫定挙動

- なし(Step 5 まですべて入った。v145)

### ページのロック(v178。Issue #6)

- 題名の横の鍵のボタン、または目次の「⋯」メニューの「ロック / ロック解除」で付け外しする(パスワードは無い。誤って書き換えないためのもの)
- ロック中のページは、ロックを外すまで編集できない: 本文と題名の入力、ブロックの追加・削除・移動・種類の変更、書式の変更、貼り付け、
  表・グラフ・数式の編集、ToDo のチェック、置換(ほかのページは置き換わる)、Undo / Redo でロック中のページの中身を変えること、ページの削除
- ロック中もできる: 読む・選んでコピー・検索・トグルの開閉・リンクでの移動・保存
- ロック中は、つまみ・表の取っ手・画像の操作を出さず、書式・数式・色・添付の道具を無効にする。目次のそのページに鍵の印
- 編集しようとしたときは、画面下に「このページはロックされています…」と少しの間出す
- 何かの経路で中身が変わっても、ロックした時点の中身へ戻す(安全網。トグルの開閉は除く)
- ロックはファイルに保存され(形式 0.8.2 の `pages[].locked`)、開き直してもロックのまま。旧いファイルはロックなしで開く
- ロックの付け外しは Undo の対象にしない
- ロックしても本文の並び(幅・位置)は変わらない(つまみの列は見えなくするだけ)
- 対応するテスト: `lockButtonLocksPage` `lockKeepsLayout` `lockedPageDisablesTools` `lockedPageIgnoresTyping` `lockedPageShowsNotice` `lockedPageIgnoresPaste`
  `undoKeepsLockedPage` `lockedPageAllowsSelection` `lockedPageAllowsToggle` `lockSafetyNetRestoresContent` `replaceSkipsLockedPage`
  `lockIsSavedInFile` `lockSurvivesReopen` `oldFileOpensUnlocked` `pageMenuLocksPage` `lockedPageCannotBeDeleted` `unlockAllowsEditing`

### 図表の題名と通し番号(v191。形式 0.8.3)

- 表・グラフ・画像のブロックのメニューの「題名を付ける」で題名の欄が出て、そこへ移る。打つと「表n:」「図n:」の番号が付く
  (グラフと画像は「図」。題名の無いものには番号も付かない)。「題名を外す」で外せる。空のまま欄を離れると外れる
- 番号は文書全体の通し(ページをまたいで続く。順は保存HTML・印刷と同じ)。並べ替え・追加・削除で振り直される
- 表の題名は表のすぐ上(上のブロックより下の表に近い)。セルを編集している間だけ、題名と表のあいだに列の記号 A・B・C が出る(題名が上へずれて場所を空ける。表は動かない)。図の題名は図の下。画像の題名は画像の寄せ(左・中央・右)に合わせる
- 題名の無い表の左上の呼び名は「(表 n)」(このページの中の順)。題名のある表は題名の行が呼び名を兼ねる
- グラフの設定欄の表の一覧も同じ呼び名(題名のある表は「表n: 題名」)
- 保存HTML・印刷・コピーした HTML にも同じ番号で出る。題名は文字のまま(HTML として解釈しない)。ロック中は題名を編集できない
- 対応するテスト: `untitledTablesShowParenLabel` `menuAddsCaptionAndFocuses` `tableCaptionNumbered` `tableCaptionAboveTable` `tableCaptionHugsItsTable` `columnLettersBetweenCaptionAndTable` `editingDoesNotMoveTable` `captionReturnsAfterEditing`
  `figureCaptionsNumbered` `figureCaptionsBelow` `renumberAfterMove` `emptyCaptionRemoved` `undoRestoresOrderAndNumbers`
  `numbersAreDocumentWide` `savedHtmlShowsNumbers` `savedCaptionPlacement` `captionsRoundTrip` `captionIsEscaped`
  `lockedCaptionDisabled` `chartPaneUsesTableLabels`(位置の一致は layoutParitySuite)
- 既知の制限: 本文の検索・置換は題名を対象にしない

### 本文の中の図表の参照(v198。形式 0.8.6)

- 本文で「/参照」を選ぶと、題名の付いた表・図の一覧(文書全体。別のページのものは「ページ「…」」と添える)が出る。
  選ぶと「/参照」が消えて「表n」「図n」の印が入り、そのまま続けて打てる
- 印が持つのは行き先の id だけ。番号は描くたびに数える(並べ替え・題名の付け外しに追従)。行き先が無い(消えた・
  題名を外した)ときは赤い「参照先なし」。Undo で戻る
- 印を押すと行き先へ移る(別のページなら切り替える)。置換しても印の文字は変わらない
- 番号が変わると、検索・目次・保存HTMLの目次も今の番号を使う(v213。`syncFigureRefTexts`)。ロック中のページに印があっても、
  ほかのページで番号が変わる編集はふつうにでき、Undo もできる(ロックは印を id だけで比べる。`lockBlockKey`)
- 保存HTMLでは題名の段落(id="fig-…")へのリンク。別のページの表・図でも、押すとそのページへ切り替わる。細工した id は使わない
- 対応するテスト: `slashOffersReference` `referenceListShowsCaptionedFigures` `referenceInsertedAsChip` `referenceFollowsRenumbering`
  `referenceShowsMissing` `undoRestoresReferenceTarget` `chipClickJumpsToTarget` `replaceLeavesChipIntact` `savedReferenceIsLink`
  `savedReferenceStoresIdOnly` `savedReferenceSwitchesPage` `unsafeReferenceIsNeutralized`
  `searchFindsCurrentNumber` `tocShowsCurrentNumber` `savedTocShowsCurrentNumber` `lockedPageRefAllowsRenumbering`
- 既知の制限: 開いたファイルのブロックの id を振り直したとき(細工した id のときだけ)、その id への印は付け替えない(「参照先なし」になる)

### 見出しに番号・見出しへの参照(v218。形式 0.8.8)

- View →「見出しに番号」(✓ で入。コマンドパレットにも同じ項目)。**文書の設定**で保存される(manifest の `settings.headingNumbers`。
  入のときだけ書く)。既定は切。0.8.7 以前のファイル・おかしな値は切で開く。切り替えは Undo の1手で、変更あり(dirty)になる。
  ページの中身は変えないので、ロック中のページを見ていても切り替えられる
- 入なら見出し1〜3(トグル見出し1〜3も)に「1」「1.1」「1.1.1」。見出し4・5には付けない。数え方は図表の番号と同じ
  文書全体の通し(ページ一覧の並び(v253。Issue #105) → ページの中の並び。閉じたトグルの中の見出しも数える)。上の段が無いまま下の段が来たら
  上の段は 0(見出し1の直下の見出し3は「1.0.1」、最初の見出し1より前の見出し2は「0.1」。Word の多段階リスト・LaTeX と同じ)
- 番号は見出しの文字ではない: block.text に入らない・検索に当たらない・選べない・キャレットが入らない(エディタは
  `data-heading-number` を ::before で描く)。並べ替え・削除・段の変更・ページの移動で振り直される
- 番号はエディタの見出し・目次ブロック・見出しの道筋の帯・保存HTML(`<span class="heading-number">`。目次は `.toc-number`)・
  印刷に出る。切の文書の保存HTMLは番号も CSS も設定の項目も出ない(形式の版の文字だけ変わる)
- 「/参照」の一覧に「見出し」のまとまり(文書全体の見出し1〜5。別のページのものはページ名を添える)。表・図は「表・図」のまとまり。
  印は図表と同じ `span.figure-ref`(行き先の id だけを持つ)で、文字は「番号 名前」(番号が切・見出し4・5は名前だけ)。
  番号・名前の変更に追従し(打っている見出しのキャレットは動かない)、見出しでなくなる・消えると「参照先なし」。押すと見出しへ移る
  (別のページへも)。保存HTMLでは見出し(`#block-…`)へのリンクで、別のページの見出しなら押すとそのページへ切り替わる
- 見出しの名前には、見出しの中の参照の印の文字を入れない(自分や互いを参照しても名前が伸びない)
- ロック中のページに見出しへの参照があっても、ほかのページの番号・名前が変わる編集はふつうにでき、Undo もできる(`lockBlockKey`)
- 対応するテスト(headingNumberSuite): `headingNumbersOffByDefault` `numberingRule` `headingRefTitleExcludesChips` `offOutputHasNoNumbers`
  `oldFileOpensWithNumbersOff` `openedFileStartsOff` `toggleShowsNumbersInEditor` `toggleMarksDirtyAndChecksMenu` `editorTocShowsNumbers`
  `numbersNotInTextOrSearch` `numberingIsDocumentWide` `stickyBarShowsNumbers` `referenceMenuListsHeadings` `headingRefInserted`
  `headingRefAcrossPagesShowsNumber` `headingRefFollowsTitleEdit` `renumberOnLevelChange` `renumberOnDelete` `renumberOnReorder`
  `headingRefShowsMissing` `headingRefRestoredByUndo` `headingRefClickJumps` `savedHtmlHasNumbers` `savedManifestHasSetting`
  `savedHeadingRefIsLink` `savedStickyBarShowsNumbers` `savedHeadingRefSwitchesPage` `reopenedFileKeepsNumbers` `printShowsNumbers`
  `headingRefWithoutNumbersShowsTitle` `toggleIsOneUndoStep` `lockedPageHeadingRefAllowsRenumbering` `noPageErrors`
- 既知の制限: 番号の書式(「1.」「第1章」など)・始まりの番号・見出し4・5の番号は選べない。古い版の Pagelith で開くと
  見出しへの参照は「参照先なし」に見える(印と id は残るので、新しい版で開き直せば戻る)

### 不具合探しで直したもの(v213)

- 保存: 本文などに `</SCRIPT>`・`<!--<script>` があっても保存したファイルが開け、保存HTMLで文字がスクリプトとして動かない
  (manifest の JSON の `<` を `\u003c` にする)。テスト: saveEscapeSuite
- グラフ・表の式: 小さい値(1e-12 など)の目盛りで落ちない・描けないグラフがあっても文書は開ける・式の極小/極大の値を
  有効数字で出す・ヒストグラムの区間は 1000 まで。テスト: chartNumberFixSuite
- グラフ: 画面に出ていないグラフ(閉じたトグル・別のページ)も、保存・印刷の前に今の表で描き直す。テスト: chartStaleSvgSuite
- 編集: 置換が数式・コードのチップの中のソースを置き換える・スラッシュコマンドは打った「/…」だけを消して書式を残す・
  文字のあるブロックで区切り線/改ページ/表/目次/グラフを選ぶと下に新しいブロックを入れる。テスト: editFixSuite
- 中の不具合(同じ v213): 行頭の Markdown 変換とスラッシュメニューはキャレットの位置で判定・チェック済み ToDo の先頭の Enter・
  子を持つ親の直後への挿入/移動で子を奪わない・段組みの列をまたがない(editKeysFix2Suite / blockTreeFixSuite)。書式付き1行の
  貼り付けは画面と保存が同じ・検索欄でも Ctrl+S/O/P・題名の変更は Undo の1手(appFix2Suite)。ロック中のページに関わる削除は
  断る・グラフの範囲が表の行列に追随・結合の文字の二重/色の消失・行列削除時のエラー(lockTableFixSuite)。表のセル範囲の
  コピー/切り取り/削除と TSV の貼り付け(cellRangeClipboardSuite。切り取りは v246 から貼ったときに移す。tableCutSortSuite)
- 低の不具合(同じ v213): Undo の単位・選択+Enter・コード類で /参照 を出さない・置換の件数(lowFixEditSuite)。目次の追随と
  インライン描画・360px の検索バー・#見出しで別ページを開く・本文の無いページ(lowFixUiSuite)。0x10 は文字・目盛りの文字・
  全角「＝」の式(読めるときだけ式)・連番の小さい値(lowFixNumberSuite)
- 既知の制限: 全角「＝」の判定は構文と関数名だけ(「＝Z99」のような範囲外の参照は式として 0)。印の中の一致は検索では数えるが置換しない
- 既知の制限: 範囲を選んだあとセル内の文字を選んでも Ctrl+C は範囲のコピー。TSV の貼り付けで足す行数に上限は無い
  (「上へ移動」でトグルの中に入る・後ろへのドロップの線のずれは v221 で直した)
- 既知の制限: 1e17 付近の幅の狭いデータでは目盛りの文字が同じに見える(有効数字2桁)。±1e308 のような値は棒が描かれない
  (落ちずに開けるところまで)。連続データの自動入力(`formatFillNumber`)には 1e-10 の丸めが残っている

### 不具合探し第2弾と速さ(v221)

- 細かい点: 「上へ移動」は子を持つ親の前へ(子にならない)・後ろへのドロップの線は実際の行き先に出る・まとめ移動も子を奪わない・
  スラッシュメニューはキャレットが「/…」を離れたら閉じる・コード類で候補の無い「/…」は Enter を取らない。テスト: smallFix3Suite
- 日本語入力: つまみのメニューの検索欄で変換が壊れない・書体/サイズを選んだ直後の変換で1文字目が重ならない・変換1回 = Undo 1手
  (Esc で取り消したら何も残さない)・変換中の Enter / Esc を全体の処理が拾わない・表のセルの全角数字は数・スラッシュメニューと
  コマンドパレットで全角英数字と日本語名が当たる・「/参照」の一覧中の入力位置・日本語の文中では「/参照」の前後に空白を残さない
  (「結果は表1に示す」)・全角空白だけのリスト項目の Backspace。テスト: imeFixSuite
- 画像・添付・フォント: 印刷・PDF で画像と埋め込みフォントが出る・添付の読み込み中にページ/文書を切り替えても元の所へ入る
  (文書が替わったら入れない)・ロック中のページには入れない・使われていない添付は保存の前に外す・入力欄への画像の貼り付けは
  添付しない・子を持つ親への添付は子を奪わない・読めない添付は外して開く(開けなかったら前の文書のまま)・フォント名の「,」と
  総称名・拡大表示中のキーは本文を変えない。テスト: filesFixSuite
- 速さ: Undo の履歴は添付の中身を写さない(20MB の添付で1手 +53MB → ほぼ 0。undoMemorySuite)・表の計算は1回の通しで行を
  1回だけ整え、セルの結果を控える(100×20 の表を開く 37秒 → 0.45秒。tablePerfSuite)・セルの入力は1フレーム1回で、その表を読む
  グラフだけ描き直す・本文の並びは grid をやめて flow-root(見た目は同じ)・見出しの帯/目次/グラフのコード/すべて置換の
  打鍵の負担を減らした(typingPerfSuite)
- 既知の制限: セルの入力のあと、次のフレームまで他の式とグラフは古い表示(保存・印刷・セルを離れたときは計算し直す)
  (Enter・Backspace・Undo でページ全体を描き直していたのは v225 で直した)

### 構造の編集の部分の描き直し(v225)

- 構造の編集(Enter・行頭 Backspace / 行末 Delete の結合・Tab / Shift+Tab・行頭の Markdown・スラッシュメニュー・つまみのメニューの
  変換/上へ/下へ/複製/削除/題名を外す・ドラッグ・ブロックの貼り付け・トグルの開閉・段組みの中の Enter・Undo / Redo)のあと、本文の
  画面は丸ごと描き直したときと同じ(番号付きリストの番号・見出しの番号・目次・表と図の番号と参照の印・グラフが読む表・段組み・
  トグルの開閉・ロックしたページ)。変わっていない行は作り直さない(遠くのグラフの絵・表・数式は同じ要素のまま)
- テスト: partialRenderSuite。手順ごとに `partialRender…` の1つ(丸ごと描き直した結果と同じ、かつ行の多くが同じ要素のまま残った =
  部分の描き直しを通った。どちらが崩れたかは証拠 `partialRenderEvidence` の same・keptEnough で分かる)。手順は EnterAtEnd・EnterUndo・EnterRedo・EnterSplit・SplitUndo・BackspaceMerge・
  MergeUndo・DeleteMerge・DeleteMergeUndo・TabNumbered・ShiftTabNumbered・TabUndo・MarkdownHeading・MarkdownHeadingUndo・
  SlashHeading・SlashHeadingUndo・MenuConvertHeading・MenuConvertUndo・MenuMoveDown・MenuMoveUp・MoveUndo・MenuDuplicate・
  MenuDelete・DeleteUndo・CaptionRemove・CaptionRemoveUndo・ChartSourceChange・ChartSourceUndo・DragDrop・DragUndo・BlockPaste・
  PasteUndo・ToggleOpen・ToggleClose・ToggleUndo・ColumnEnter・ColumnUndo・LockedToggleClose
  (例: `partialRenderTabNumbered`)。ほかに
  `partialRenderSelectionMarksMovedBlock` `partialRenderLockedPageStaysReadOnly` `partialRenderKeepsFarRowsOnEnter`
  `partialRenderKeepsFarRowsOnUndo` `partialRenderKeptRowHandlersWorkAfterUndo`(Undo の後も残した行の ToDo のチェックが文書に効く)
  `partialRenderRebuildsRowChangedInPlace`(描いた後に DOM を書き換えた行は作り直す) `partialRenderRowInsertRestylesLocally`
  (行の出し入れで全行のスタイルを計算し直さない) `partialRenderEnterOn5000IsFast` `partialRenderUndoOn5000IsFast`
  `partialRenderKeyHandlingOn5000IsFast` `partialRenderEnterOnMixed1000IsFast` `partialRenderNoPageErrors`
- 既知の制限: 行の多いページでは、行を1つ入れるだけでもブラウザの1フレームの処理に時間がかかる(5000 ブロックで 0.15〜0.2秒。
  HANDOVER §4.30)。段組みの中の1行が変わると段組みごと作り直す。目次は描き直しのたびに作り直す

### エディタと保存HTMLの見た目(v190。P7)

- 同じ文書をエディタと保存HTMLで開くと、ブロックの種類ごとに本文の位置(左右・上下の間隔)・文字の大きさ/太さ/行の高さ/色・
  記号(点・番号・箱・三角)の位置・長い段落の折り返し・表/グラフ/数式/目次/ページリンク/添付/画像/段組み/区切り線の位置と大きさが
  そろう(差は 1.5px 以内。箱は 2px 以内)
- 題名は本文より 50px 左に出る(エディタ・保存HTMLとも。印刷では本文の左端)。ユーザー決定
- 済んだ ToDo は灰色で取り消し線(エディタ・保存HTMLとも)。エディタの箱は OS 標準のチェックボックスではなく、保存HTMLと同じ図形。ユーザー決定
- グラフのコードの帯は、グラフの上(エディタと同じ順)
- エディタの表の上の「表 n」は編集用の印なので、保存HTML・印刷には出さない(間隔だけそろえる)。ユーザー決定
- 保存HTMLの画像の名前とダウンロードのボタンは、マウスを乗せたとき・フォーカスしたときに出る(エディタは選んだときに出る)
- 対応するテスト: `parityTextPositions` `parityFonts` `parityMarkers` `parityBoxes` `parityLineWraps` `parityTitle` `parityCheckedTodo` `parityToggleNestedIndent`(トグルの中の入れ子も1段ごとに 28px。#132) `parityTableCellNewline`(セルの中の改行。#136)
  (ずれがあると `parityEvidence` に「どの文字・どの箱が何 px ずれたか」が出る)

### 本文の見た目の正は1つ(v286。Issue #201)

- 色・寸法・書体の値は document-style.js のトークン(`--doc-…`)だけ。エディタも保存HTMLも同じ値を使い、同じ部品(書式の印・データベースの札・
  グラフの絵など)は同じ規則の文を使う。style.css と document-format.js に本文の色を直に書かない
- 本文の書式の無害化(残す書式・書体の目印・コードの中身・行き先の無い参照)はエディタと保存HTMLで同じ決まり
- 対応するテスト(documentStyleSuite): `portableCssUsesTokensOnly` `savedHtmlCssComesFromDocumentStyle` `editorUsesSameTokens`
  `styleCssHasNoPaletteLiterals` `formatHasNoPortableCss` `noDuplicatedFunctions` `sanitizerRulesShared` `documentStyleIsShipped`
  (理由は `documentStyleEvidence`。直書きの色は「→ var(--doc-…)」の形で出る)

### app.js を役割ごとのファイルに分ける(v287。Issue #207 の1回目)

- 表の計算は table-formula.js、グラフ(コードの読み方・組み立て・絵)は chart.js、数式の変換(TeX → MathML)は tex-math.js。
  挙動は変えていない(移しただけ)。3つとも PWA のキャッシュ・デスクトップ版の同梱・index.html の読み込みに入っている
- 対応するテスト(appSplitSuite): `splitFilesAreShipped`(配る場所の全部と読み込みの順) `splitHasNoCopies`(app.js・document-format.js に
  関数の写しが無い) `splitFilesWorkWithoutApp`(app.js を通さず、ファイルの窓口だけで式・グラフ・数式を作れる)。理由は `appSplitEvidence`
- 挙動は既存の表・グラフ・数式のスイート(tableSuite・tableExcelSuite・chart*Suite・mathSuite など)がそのまま確かめる

### 印刷・PDF(v182)

- File の「Print / PDF」と `Ctrl+P` は、エディタの画面ではなく保存HTMLと同じ形を見えない枠(`.print-frame`)で開いて刷る
  (全ページ・ページごとに改ページ)。PDF はブラウザの印刷の「PDF に保存」。PDF の既定のファイル名は文書の題名
- 保存HTMLの `@media print`: 色と点は「背景のグラフィック」によらず出す(`print-color-adjust:exact`)・閉じたトグルも開く
  (`::details-content`。エディタからの印刷は枠の中で open も付ける)・グラフのコードとダウンロードのボタンは刷らない・
  見出しの直後や表の行・図・コードの途中で改ページしにくくする
- 表の見出しの行は `<thead>` に入れ、ページをまたぐと次のページの先頭にも出る(見出しの意匠の指定も thead に変えた)
- ブラウザのメニューから直接エディタを刷った場合も、道具・目次・つまみは刷らない(本文は表示中のページだけ)
- 保存HTML(と印刷)でも、トグルの中身はトグルの文字の頭にそろえて字下げする(v182。それまでは左端に出ていた。エディタと同じに)
- 対応するテスト: `ctrlPPrintsPortableDocument` `printIncludesAllPages` `printOpensClosedToggles` `printUsesDocumentTitle`
  `printFrameRemovedAfter` `printRestoresTabTitle` `menuPrintWorks` `editorPrintHidesChrome` `printKeepsBulletDots`
  `printOpensToggleByCss` `printHidesChartSource` `printRepeatsTableHeader` `tableHeaderStyleOnlyOnHeaderRow` `printShowsEveryPage` `toggleChildIndentedLikeEditor`
- 既知の制限: 印刷の画面はブラウザのもの(用紙・余白・ヘッダーとフッターはそこで選ぶ)。デスクトップ版(exe)での印刷は未確認

### 画面の知らせ(v179)

- 注意(保存や添付の失敗、表の操作ができないときなど)は、画面の下に4秒ほど出す。クリックで消える。続けて出たら文面を差し替える
- 成功などの知らせは画面に出さない(読み上げ用の `#status` にだけ書く。頻繁でうるさいため)
- 読み上げは `#status` が受け持ち、画面の知らせ `#notice` は読み上げない(二重に読まれないように)
- ロック中のページを編集しようとしたときの知らせも、この仕組みで出る
- 注意の文言は日本語(v181)。エラーの中身をそのまま出すときも「保存できませんでした: …」のように日本語の前置きを付ける。
  Monolio の文書でない HTML を開いたときは「開けませんでした: Monolio の文書ではありません」(v221 までは Pagelith)
  - テストはソースの `setStatus(…, "warn")` をすべて拾って、日本語を含むことを確かめる(足した注意が英語だと赤になる)
- 対応するテスト(v181): `warnMessagesAreJapanese` `openNonDocumentExplains`
- 対応するテスト: `noticeHiddenAtStart` `warnShowsNotice` `noticeMatchesStatus` `noticeNotAnnouncedTwice` `noticeClickDismisses` `okStaysQuiet` `noticeAutoHides`

### 複数ページの決まり(暫定ではない)

- **表の参照 `table(n)`・`table(id="…")` と目次ブロックはページの中で閉じる**(n はそのページの中で数える。id で指す表もそのページの中だけを探す／
  目次ブロックはそのページの見出しだけを並べる)
- ページブロックを本文から消しても、ページは残る(消すのは目次の「削除」だけ)

### 解消した暫定挙動(記録)

- 保存HTMLが全ページの本文を切り替え無しで縦に並べて出していた(P7 の一時的な不一致)→ **v142(Step 4)で解消**。
  保存HTMLでも1ページずつ表示して切り替える。全ページが縦に並ぶのは、スクリプトが動かない環境と印刷のときだけ
  (意図した段階的な強化。上の「保存HTMLの複数ページ(Step 4)」を参照)
- ページの削除が無かった → **v138(Step 3)で解消**(目次の「削除」)
- 検索が現在ページだけだった → **v145(Step 5)で解消**(検索バーで「このページ/このページと子ページ/全ページ」を選ぶ。
  上の「検索・置換」を参照)

複数ページ(Step 2〜3)のテスト:
- 対応するテスト: `slashPageCreatesPageAndMovesThere` `pageTreeNestsChildUnderParent`
  `parentKeepsLinkToNewPage` `pageLinkClickSwitchesPage` `undoPageCreationFallsBackToFirstPage`
  `saveReopenKeepsPagesAndLinks` `undoReturnsToEditedPage` `redoReturnsToEditedPage`
  `pageSwitchDoesNotDirtyDocument` `reopeningSameFileStartsAtFirstPage` `everyPageAppearsInTree`
  `unclassifiedCollectsUnreachablePages` `unclassifiedStartsFromUnlinkedPages`
  `treeTopIsFirstPageOnly` `unclassifiedCycleShownOnce` `multiParentPageShownUnderBothParents`
  `documentTitleComesFromFirstPage` `pageTitlesAreIndependent` `firstPageStaysRootEvenWhenLinkedBack`
  `narrowPageTreeToggleVisibleWhenClosed` `narrowPageTreeClosesWithEscapeAndOutsideTap`
  `pageBackForwardFollowsHistory` `pageBackRestoresScrollPosition` `navigatingAfterBackClearsForward`
  `pageBackForwardDoesNotDirtyDocument` `pageBackForwardAddsNoUndoHistory` `openingFileClearsPageHistory`
  `undoPageSwitchIsNotPageHistory` `step1FileKeepsTitle` `step1TitleRescueOnlyWhenUntitled`
  `openingStep1FileShowsRealTitle` `childListedOncePerParent`
  Step 3: `firstPageHasNoDeleteMenu` `firstPageDeleteCallIsNoop` `deleteDialogCountsLinksOnOtherPages`
  `cancelDeleteChangesNothing` `deletingCurrentPageMovesToPreviousPage` `childPagesMoveToUnclassified`
  `everyPageAppearsAfterDeletion` `deleteRemovesLinksFromAllPages` `deleteKeepsLinkChildBlocks`
  `deleteNormalizesColumnsOnEveryPage` `undoDeleteRestoresPageAndLinks` `undoDeleteRestoresAttachment`
  `pageHistorySkipsDeletedPageUntilUndo` `searchScopeFollowsPageDeletion` `narrowPageMenuIsAboveOverlay`
  `deletingCurrentPageKeepsItOnForwardSide` `undoPageSwitchAlignsHistoryPosition`

## 複数ページ(器のみ・Step1)

- 本文は `doc.pages[]` が持つ(**いまは常に1ページ**。ページを増やすUIは Step2)
- **振る舞いは変わらない**: 画面の見た目も、保存した単一HTMLの中身も従来どおり
- 保存形式は **0.8.0**(v137 で 0.8.1 へ。manifest.title の意味が変わったため)。マニフェストは `pages[]` を載せる
- **旧形式(0.7.0 以前の `blocks[]`)のファイルも開ける**(1ページに包んで読む)
- **添付の掃除と埋め込み書体の掃除は全ページを見る**(現在ページだけだと、他ページが使っている
  添付・書体が「未使用」と判定されて消える)
- 目次ブロックが並べるのは**そのページの見出し**だけ
- 対応するテスト: `legacyBlocksDocumentOpensAsOnePage` `pagesRoundTripKeepsEveryPage`
  `exportedBodyKeepsEveryPage` `formatVersionBumpedForPages` `tocBlockListsOnlyItsOwnPage`
  `openedFileKeepsPagesAndShowsFirst` `attachmentOfOtherPageSurvivesCleanup`
  `fontUsedOnlyByOtherPageSurvivesSave`

## ブロック種別

- **リストのマーカーの左端は、通常段落の本文左端と同じ位置**(v125)
  - 対象: 箇条書き(・) / 番号(1. と階層番号) / ToDo(☐) / トグル(▸)・トグル見出し1〜5
  - リストの本文は**マーカーの幅 + 間隔のぶん右へ出る**(マーカーと重ならない)
  - 番号が長くなっても**マーカーの左端は動かない**(伸びるぶんは右へ出て、本文も一緒に動く)
  - **引用は対象外**(border-left の意匠。段落より 11px 右のまま)
  - 字下げしても、ブロックの中での規則(マーカー左端 = 本文カラムの左端)は変わらない
  - **保存HTMLも同じ規則**(P7)。保存HTMLの「・」は本文1行目の中心に来る
  - トグルの三角の当たり判定は **24x24 CSS px 以上**(WCAG 2.2 Target Size)
  - **そろえるのは「箱」ではなく「実際に描かれた絵」の左端**(v127)。三角は文字枠の中で
    右寄りに描かれるため、箱ごと左サイドベアリングぶん左へ戻してある
    (`--toggle-marker-ink-fix`。保存HTMLは `--toggle-ink-fix`)
  - 余白はフォントで違うので、• とトグルの戻し量は開いたときに使われるフォントで測っていた(v173)。
    **v174 から記号は図形**(• は円、▸/▾ は絵の左端が枠の左端になる SVG)なので、補正なしでそろう
  - 対応するテスト: `listMarkersAlignWithParagraphText` `listMarkerInkMatchesParagraphText`
    `listTextSitsRightOfMarker` `numberedMarkerKeepsItsLeftEdge` `quoteKeepsItsOwnIndent`
    `nestedListKeepsRelativeAlignment` `toggleCaretMeetsMinimumTargetSize`
    `exportedMarkersAlignWithParagraphText` `exportedBulletMarkerSitsOnFirstLine`


- 段落を作れる
- 見出し1から5を作れる
- 箇条書きを作れる
- 階層番号付きリストを作れる
- チェックボックスを作れる
- 引用を作れる
- コードブロックを作れる
- 区切り線を作れる
- テーブルブロックを作れる
- 目次ブロックを作れる
- トグルリストを作れる
- トグル見出し1から5を作れる

## Markdown風ショートカット

- **発火は「区切りのスペースを押した時点」**（Notion と同じ）。`# ` と打った瞬間に空の見出しへ変わり、キャレットはその見出しに残る（続けて打った本文が見出しになる）
  - 記号ごとの特別扱いはしない: 見出し1〜5・`-`/`*`・`1.`・`>`・`[]`/`[ ]` のすべてが同じ時点で発火する（以前は見出し・引用・todo だけ本文1文字を要求し、`# a` まで打たないと変わらなかった）
  - ``` ``` は区切りのスペースを持たない別トリガーなので、従来どおり3文字目で変換する
  - IME 変換中のスペース（候補送り）では発火せず、確定（compositionend）で判定し直す
  - プレフィックスが崩れていれば発火しない（`#x ` は段落のまま）。変換は Undo 1手で「記号+スペース」の段落に戻る
  - コード・グラフ・数式の中身はソースなので変換しない（`# コメント` や `---` でブロックごと化けていた **New-26** の再発防止）
  - （`markdownHeadingFiresOnSpace` `markdownAllPrefixesFireOnSpace` `markdownBrokenPrefixStaysParagraph` `markdownSpaceConversionUndoes` `markdownShortcutSkipsDuringIme` `markdownShortcutSkipsCodeSource` `markdownFenceStillFiresWithoutSpace`）
- **すでに文字がある文の頭に目印を打っても変換できる**（v154。ユーザー原文「文の頭に - をつければ箇条書きになるはずだけど、
  なる場合とならない場合がある」）。判定は最初の行の先頭だけで、本文は2行目以降も残る
  - 本文に見えない末尾の改行（`<br>` 由来。Shift+Enter の後に消した跡・末尾改行つきの貼り付け）があっても `- ` で箇条書きになり、本文はそのまま
  - 複数行の本文を変換しても2行目が残る。先頭の太字・文字色は変換で消えない
  - `-` の次の行に本文があるだけ（`-\nabc`）は変換しない（区切りに改行を含めない）
  - `+ ` `1. ` `> ` `# ` でも同じ。末尾に改行の付いた1行を貼り付けても、本文に見えない改行を足さない
  - 目印が太字の中にあっても（`<b>- 本文</b>`）、目印だけが消えて太字は残る
  - 見た目が空の段落（見えない改行だけ）で `---` と打つと区切り線になる
  - 段落の末尾で Shift+Enter → 別のブロックへ移って戻り、末尾に打つと新しい行に入る（見えている空行は消えない）
  - 段落の末尾で Shift+Enter → そのまま打つと、本文は「元の文字+改行+打った文字」で、画面でも新しい行にある
  - 段落の末尾で Shift+Enter を2回 → ブロックを離れても空行が残る（本文が `\n\n` で終わる）
  - 区切りは Markdown の仕様どおり: `-`+全角スペースでは変換しない／`-`+NBSP では変換する（v155。ユーザー確定）
  - コード・グラフ・数式のソースの末尾の改行は、ブロックを離れても残る（v155）
  - IME の「ー」「－」は目印にしない（対象外）
  - （`markerOnTextWithTrailingNewlineConverts` `markerOnMultilineKeepsSecondLine` `markerConversionKeepsBold` `markerConversionKeepsColor`
    `markerFollowedByNewlineDoesNotConvert` `otherMarkersOnTextWithTrailingNewlineConvert` `markerAfterShiftEnterAndBackspaceConverts`
    `pastedTrailingNewlineIsDropped` `markerInsideBoldKeepsBold` `dividerOnInvisibleNewlineConverts` `shiftEnterAtEndKeepsNewLine`
    `sourceTrailingNewlineSurvivesSync` `shiftEnterThenTypeGoesToNewLine` `doubleShiftEnterKeepsBlankLine`
    `markerWithIdeographicSpaceDoesNotConvert` `markerWithNbspConverts`）
- `# ` で見出し1に変換できる
- `## ` で見出し2に変換できる
- `### ` で見出し3に変換できる
- `#### ` で見出し4に変換できる
- `##### ` で見出し5に変換できる
- `- ` で空の箇条書きに変換でき、そのまま本文を入力できる
- `+ ` でも空の箇条書きに変換できる（Markdown に合わせた3つ目のマーカー。`plusMakesBulletOnSpace`）
- `* ` で空の箇条書きに変換できる
- `1. ` などの数字とピリオドで空の番号付きリストに変換でき、そのまま本文を入力できる
- `[] ` または `[ ] ` でチェックボックスに変換できる
- `> ` で引用に変換できる
- ``` ``` でコードブロックに変換できる
  - 既存の文の頭に ``` を打つと、後ろの本文はコードの中身に残る(複数行も)。既存の文の頭に「```js」を貼ると js だけ捨てる
  - 空の段落に「```js」を貼ると言語名として捨てる(New-20)。空白を含む「```my code」は捨てずに中身にする
  - 変換は Undo 1手で段落に戻る(v157。TL 推奨・PdM 決定)
  - (`fenceAtHeadOfTextKeepsBody` `fenceAtHeadOfMultilineKeepsAllLines` `fencePastedLanguageAtHeadKeepsBody` `fenceLanguageAtEndIsDropped`
    `fenceNonLanguageTextIsKept` `fenceConversionUndoesInOneStep`)
- `---`、`___`、`***` で区切り線に変換できる
- `` `aaa` `` のようにバッククォートで囲んだ文字列をインラインコードに変換できる

## インライン装飾

- 太字を適用できる
- 斜体を適用できる
- 取り消し線を適用できる
- 文字色を適用できる
- 背景色を適用できる
- 初期状態では背景色が未設定で、背景色ボタンにも特定の色が表示されない
- 文字色は黒・赤・青・緑、背景色は白・灰・赤・青・緑を先頭にした、それぞれ10色の標準スウォッチから選べる
- 色メニューを操作しても対象テキストの選択範囲が失われない
- 背景色のボタンは Google ドキュメントと同じマーカーのアイコンで、下のバーが現在の色を示す
- 標準色にない色はカスタムカラーピッカーから指定できる
- カスタム色は色選択画面の外をクリックして閉じても、現在の選択範囲または入力位置へ適用される
- 色付きの文字と通常文字の間でカーソルを移動すると、文字色・背景色のボタン表示がカーソル位置の書式へ同期する
- 色付き文字の末尾で別の背景色を選ぶと、入力前からボタンが新しい色を示し、続けて入力する文字にも同じ色が付く
- 背景色を設定した空ブロックをBackspaceで削除して前のブロックへ移動すると、背景色ボタンが移動先の書式へ同期する
- Backspace後の移動先が色付きインライン要素の末尾なら、背景色ボタンと続けて入力する文字の背景色が一致する
- 文字サイズは Google ドキュメントと同じ「− 数値欄 ＋」で操作する
- 数値欄に直接サイズを打ち込み、`Enter` で選択範囲へ適用できる
- 数値欄をクリックすると 6〜96 の一覧が開き、選んだ値がその場で適用される
- 一覧やステッパーを操作しても選択範囲・キャレットを失わない
- `＋` `−` でサイズが 1 ずつ変わる
- `Ctrl+Shift+.` `Ctrl+Shift+,` でもサイズが 1 ずつ変わる
- 数値欄で `↑` `↓` を押してもサイズが 1 ずつ変わる
- 数値欄で `Esc` を押すと、打ちかけた値を捨てて元の表示に戻る
- 起動直後など本文にキャレットが無い間も、数値欄は空にならない
- フォントを選択範囲へ適用できる
- フォント選択の既定項目に、実際に使われている書体名が `Default (書体名)` の形で表示される
- 書体名を判定できない環境では `Default (system-ui)` と表示される
- 文字サイズの表示は、キャレット位置の実際のサイズになる（見出しなら見出しのサイズ）
- サイズを明示指定したテキストでは、その値が表示される
- 範囲選択では、その範囲に効いているサイズ・書体が表示される（選択の先頭だけを見ない）
- 複数のサイズが混ざった選択では、文字サイズの数値欄が空欄になる
- 複数の書体が混ざった選択では、フォント選択が空欄になる
- 見出しと本文をまたぐ選択のようにブロックをまたぐ場合も空欄になる
- タイトルを含むページ全体の選択でも空欄になる
- 混在表示用の空の選択肢は、フォントの一覧には現れない
- 書体の3枠（本文 / 明朝 / 等幅）が **OS・環境の標準**に解決される（v122 で同梱フォントを撤去）
  - 選択肢は `Sans-serif (環境標準)` `Serif (環境標準)` `Monospace (環境標準)`（`枠名(書体名)` の形は維持しつつ、括弧の中で「環境で変わる」ことが読み取れる）。添付フォントを選んだときは従来どおり実際の書体名を表示
  - 同梱フォントの `@font-face` も `fonts/bundled-fonts.css` の読み込みも残っていない
  - **既定では1つも埋め込まない**。3枠の書体を本文へ適用しても埋め込みは増えない
  - 保存HTMLに入るのは「ユーザーが添付して本文に使った書体」だけ（`unicodeRange` 付きのチャンクは1つも入らない）
  - エディタ（style.css）と保存HTML（書き出しCSS）が**同じスタック**を使う＝同じ環境なら見た目が一致する（P7）
  - 失うもの: 環境をまたぐと字形が変わる／日本語の等幅（桁揃え）は保証されない
  - （`osFontStacksAppearInPicker` `removedFeaturesStayGone` `noFontEmbeddedByDefault` `osMonospaceAppliesToText` `exportEmbedsOnlyChosenFonts` `editorAndExportShareFontStack`）
  - キャレットだけの状態で選び、そのまま入力しても書体が残る
    - 引用符を含む書体名（`"Courier New"` など）でも指定が捨てられない。かつて
      "M PLUS 1 Code" の先頭が数字で、引用符の無い font-family 指定が丸ごと無効になった
  - 再描画やサニタイズを通っても指定が残る
- フォント選択は独自のメニュー（v180。Issue #4。`<select>` はやめた）
  - ボタンを押すと、検索欄と一覧が開く。書体名はその書体そのもので表示される
  - 検索欄に打った文字で名前を絞り込む。何も合わなければ「見つかりません」
  - `↑` `↓` で動かして `Enter` で適用、`Esc` で閉じて本文の選択へ戻る。ボタンにフォーカスして `↓` や文字を打っても開く
  - 選んだあとも本文の選択(キャレット)は外れない。外を押すと閉じる
  - 開いても文書はスクロールしない（一覧の中だけを動かす）
  - メニューはボタンの真下に出る。ツールバーの中の一覧(文字サイズの一覧・色)も同じ。v179 までは、左に目次があるとその幅だけ右へずれていた
    （ツールバーの backdrop-filter で position: fixed の基準がツールバーになるため。`positionPopover` が置いた位置を測って戻す）
  - 埋め込みフォントの行に削除ボタン（「Attach Files」メニューの削除と同じ動き）
  - 対応するテスト: `fontNamesShownInOwnFont` `fontMenuOpens` `fontMenuKeepsPageScroll` `mousePickAppliesFont` `mousePickKeepsSelection`
    `triggerShowsChosenFont` `fontSearchFilters` `searchEnterAppliesFont` `searchEnterKeepsSelection` `fontSearchShowsEmpty`
    `escapeClosesAndRestoresSelection` `keyboardOpensMenu` `arrowKeysMoveAndEnterApplies` `typingOnTriggerFilters` `outsideClickCloses`
    `embeddedFontGrouped` `menuEmbeddedFontApplies` `removeFromMenuDeletesFont` `popoversAlignUnderTrigger`
- フォント選択の「PC のフォントを表示…」を選ぶと、OSのフォント一覧が読み込まれる（読み込んだあと、メニューを開き直す）
- 一覧は「文書に埋め込み済み」と「PC のフォント(使うと埋め込み)」に分けて表示される(v181 で日本語に)
  - テストは「PC のフォントの件数 = OS が返すファミリー数」で見る。適用確認は Arial、無い環境(Linux)では一覧の英数字名のフォントを使う
- 権限が既に許可されているセッションでは、起動時に一覧が読み込まれる
- OSフォント一覧を読み込むだけでは、フォントは埋め込まれない
- OSフォントを本文へ適用した時点で、そのフォントファイルが埋め込まれる
- 適用したテキストを削除して保存すると、そのフォントの埋め込みも消える
- 文字サイズとフォントは再描画後も保持される
- キャレットだけの状態でフォントを選び、続けて入力した文字にその書体が付く
- キャレットだけの状態で文字サイズを選び、続けて入力した文字にそのサイズが付く
- 選んだ直後、入力前でもフォント選択と数値欄が選んだ書体・サイズを表示し続ける
- 内部用の目印(書体名やサイズ)が本文へ残らない
- 選択していないテキストの書式が、キャレット位置でのフォント変更に巻き込まれない
- ツールバー操作でフォーカスが外れても、書式は外れる前のキャレット位置へ適用される
- マウスで選択したあとも、編集領域が生きている
  - 編集領域がひとつも無い状態で入力を待つと、日本語入力の1文字目が英字のまま入る
  - 1つのブロックに収まる選択: ブロックへフォーカスが戻る（キーボード選択と同じ状態）
  - ブロックをまたぐドラッグ中: ブロック個別の contenteditable を外し、入れ物 (`#blocks`) を
    ひとつの編集領域にする。別々の編集領域にまたがる選択はブラウザが保持できないため
  - 離すとブロックの選択になり(v206)、入れ物は編集可能のまま残らない
- どの選び方をした範囲にも、ツールバーの操作がキー入力なしで効く
  - マウスのドラッグ選択
  - ダブルクリックの単語選択
  - トリプルクリックの行選択（範囲の終わりが次のブロックまで伸びる）
  - ブロックの選択(ドラッグでまたいだとき・つまみや矩形で選んだとき。選んだブロックの文字全部に当てる。v206)
  - Ctrl+A、Shift+End などのキーボード選択
- ツールバーの操作対象は次のすべて
  - 太字・斜体などのボタン
  - 文字サイズの一覧・＋ − ボタン
  - フォント選択
  - 文字色・背景色
- 書式済みテキストの直後にキャレットを置いて別フォントを選ぶと、続けて入力した文字だけが新しい書体になる
- 太字・斜体・取り消し線はトグルではなく、選択範囲全体への適用か解除になる
  - 一部にしか付いていない範囲では、全体に付ける（解除にならない）
  - 全体に付いている範囲だけが解除される
  - 続けて2回押すと、全体に付く → 全体から外れる
  - 取り消し線も同じ規則（execCommand の効き方が太字と違う）
- 書式を当てても選択範囲が変わらない（部分選択もその範囲のまま残る）
- ブロックをまたいでドラッグすると、両端のブロックまでがブロックの選択になる(v206。Notion と同じ)
  - ドラッグ中から選択の色はブロック単位で見せ、文字の選択の色は隠す
  - 文字を打っても何も入らない(日本語入力も)。`Backspace` `Delete` はブロックを消す(Undo で書式ごと戻る)
  - コピー・切り取り・Tab・↑↓ もブロックの操作になる。← → は最初のブロックの頭/最後のブロックの末へ
  - 書式は選んだブロックの文字全部に当たり、選択はブロックのまま残る(続けて押すと全体から外れる)
  - ダブル・トリプルクリックは文字の選択のまま
- 装飾リセットで通常テキストに戻せる
- 装飾リセット後に空の装飾要素が残らない
- サイズを変えた直後にフォントを変えても、両方が適用される
- サイズやフォントを変えた直後に太字・斜体などを押しても、選択し直さずに適用される
- ＋ − のステッパーは、選択し直さなくても続けて押せる
- インラインコードはチップ方式(v104): キャレットが触れていない `` `x` `` はウィジェット1個
  (表示にバッククォートは出ない)、触れている間は素のテキスト `` `x` `` そのもの
- クリックか、隣接位置からの ←→/Backspace/Delete でウィジェットが素のテキストに見せ替わる
- 素のテキスト状態では、先頭・末尾を含む全キャレット位置に立てて、どこでも文字を挿入できる
- 左右キーは1手1位置で動く(進入・退出も1手として数える)
- バッククォートは普通の文字として `Backspace` / `Delete` で消せる。片側を消すと
  構文が壊れて素のテキストのまま残る(非破壊)。残った側もそのまま消せる

## キーボード操作

- `Ctrl+A` 1回目で現在のブロックを選択できる
- `Ctrl+A` 2回目でページ全体を選択できる
- `Ctrl+Z` で Undo できる
- `Ctrl+Y` または `Ctrl+Shift+Z` で Redo できる
- `Ctrl+S` で単一HTMLとして保存できる
- `Ctrl+K` でコマンドパレットを開ける
- `Tab` / `Shift+Tab` でブロックのインデントを変更できる(本文の `Tab` は**ブロックの先頭のときだけ**。v176)
  - 動くのは**そのブロックだけ**。下にぶら下がる子は動かさない(v211。ユーザー決定。Word・Google ドキュメントと同じ)。閉じたトグルだけは子ごと
- 本文の途中の `Tab` はタブ文字を入れ、後ろの文字の縦の位置をそろえる(タブの幅は文字4つぶん `tab-size:4em`。保存HTMLも同じ。v176)
  - 範囲を選んでいるときの `Tab` と、`Shift+Tab` は、従来どおりブロックのインデント
- `Ctrl+Home` / `Ctrl+End` で文書(いまのページ)の最初のブロックの先頭・最後のブロックの末尾へ移る(v176)
- 日本語入力の変換確定中に `Enter` を押しても、次のブロックを誤作成せず入力中の文字を維持できる
- `Escape` でメニューやパレットを閉じられる

## 検索・置換

- `Ctrl+F` で検索バーが上部ツールバー直下の右端に開き、入力欄へフォーカスが移る
- Edit メニューの Find / Find & replace からも開ける
- 一致箇所がハイライトされ、現在の一致は濃い色で区別される
  - ハイライトは CSS Custom Highlight API で塗るため、本文の DOM に装飾要素を挿し込まない
    (textContent を使うキャレット計算・シリアライズを壊さない)
- 件数と現在位置が `3/12` の形式で表示される。一致なしは `0/0`
- `Enter` / `Shift+Enter`(および ↑ ↓ ボタン)で次・前の一致へ移動し、画面がそこまでスクロールする
- 端まで行くと反対側へ折り返す
- 大文字小文字は区別しない(Notion / Google ドキュメントの既定に合わせる)
- 検索対象は、通常ブロックの本文・コードブロック・グラフ定義・表のセル
  - 数式セルは表示値ではなく式文字列を対象にする。置換で書き換えられるのは式だけで、
    表示値を対象にすると「一致するのに置換できない」ずれが生まれる(Excel の既定の検索対象も式)
  - 数式セルの一致は、計算値の中に塗る範囲が無いためセルの枠線で示す
  - タイトル・目次・添付カード・区切り線は対象外
- 閉じたトグルの中の一致も件数に入り、そこへ移動するとトグルが開く(目次のジャンプと同じ扱い)
- 本文で選択したテキストは `Ctrl+F` の検索語に引き継がれる
- `Ctrl+H` で置換入力欄も開く
- Replace は現在の一致を置き換えて次の一致へ進む。リッチ書式(太字など)は保たれる
- Replace all は検索の範囲の中(表のセル・コード・閉じたトグルの中を含む)を一度に置き換える
- 置換1回・すべて置換とも `Ctrl+Z` 1回で元に戻る
- `Esc` で閉じるとハイライトが消え、現在の一致位置へ選択が戻る
- **検索の範囲**(v145。複数ページ Step 5): 検索バーの2行目で「このページ(既定)/このページと子ページ/全ページ」を選ぶ
  - 既定はこのページだけ(ほかのページの一致は数えない)
  - 「このページと子ページ」は、このページと、ページリンクで辿れる子・孫(親・兄弟・未分類は入らない。循環しても止まる)
  - 全ページ・子ページのときは、件数の横に「今の一致のページ名 ・ N ページに一致」が出る
  - 次/前の一致がほかのページにあると、そのページに切り替わってから一致へ移る。切り替えは「戻る」で戻れる
  - 置換も選んだ範囲に従う。1件置換は、ほかのページの一致ならまずそのページを開いて見せる
  - ほかのページも変わる「すべて置換」は、件数とページ数を確認してから置き換え、`Ctrl+Z` 1回で全ページが戻る
  - 範囲の選択は保存ファイルに入らない。バーを閉じて開き直しても、ページを切り替えても、同じ文書の間は覚えている。
    ファイルを開く・新規作成すると「このページ」に戻る
  - 「このページと子ページ」は、循環や親が2つのページがあっても同じページを2回数えない
  - 表示していないページの一致も、太字などの書式を保ったまま置き換わる
  - すべて置換のあと、件数の横に「N 件を M ページで置換しました」と出る
  - ページをまたいだ移動では「戻る」の行き先が1つだけ増え(同じページの中の移動では増えない)、
    前のページのハイライトは残らない
  - 検索中にページを削除しても、結果が消えたページを指したまま残らない
  - 対応するテスト: `searchDefaultsToCurrentPage` `subtreeScopeCoversDescendantsOnly` `allScopeCountsEveryPage`
    `searchJumpShowsOtherPage` `searchJumpAddsOneHistoryEntry` `replaceAllAcrossPagesIsOneUndo`
    `pageScopeReplaceLeavesOtherPages` `searchScopeIsNotSaved` `searchScopeFollowsPageDeletion`
    `searchScopeResetsOnOpen` `replaceAllReportsPagesChanged` `subtreeScopeCountsEachPageOnce`
    `searchJumpAddsOneHistoryEntry` `searchHighlightsOnlyLivePage` `hiddenPageReplaceKeepsFormatting`
- 本文を編集すると、開いている検索の件数と塗りが追随する

対応するテスト: `searchBarOpensWithCtrlF` `searchCountsMatchesAcrossBlocks` `searchHighlightsMatches`
`searchLeavesBlockTextClean` `searchEnterNavigatesMatches` `searchWrapsAndOpensClosedToggle`
`searchTargetsFormulaSource` `searchFormulaCellShownByOutline` `searchIgnoresFormulaDisplayValue`
`searchCtrlHShowsReplaceRow` `searchReplaceOneReplacesAndAdvances` `searchReplaceUndoRestoresInOneStep`
`searchReplaceAllReplacesEverywhere` `searchReplaceAllUndoIsSingleStep` `searchReplaceKeepsFormatting`
`searchPrefillsFromSelection` `searchEscapeClosesAndClears` `searchBarHiddenByComputedStyle`

## ツールバー

- 編集中も `Unsaved` などの保存状態テキストを表示しない
- 色ボタンには最後に選んだ色が小さく表示される
- 色メニュー以外をクリックするか `Escape` を押すと色メニューが閉じる

## 上部メニュー

- 左ペインは表示されず、本文が画面幅いっぱいに使える
- ブロック種別の一覧は表示されない。ブロックの種類は Slash コマンドで選ぶ(＋ ボタンは段落を足すだけ。v206)
- File メニューから New document、Open、Save、Save As を実行できる
- File > Open で保存済みの単一HTMLを選ぶと、その文書がエディタへ読み込まれる
- 開き直した文書のタイトル、ブロック、添付一覧が復元される
- `Ctrl+O` でもファイルを開ける
- 未保存の変更があるとき、New document と Open は確認ダイアログを出す
- 確認をキャンセルすると、編集中の文書がそのまま残る
- 変更がない状態では確認ダイアログを出さずに実行される
- Edit メニューから Undo、Redo、コマンドパレットを実行できる
- Attach Files メニューからファイルを添付でき、添付一覧が表示される
- メニューを開いた状態で別のメニュー名を押すと、そちらへ切り替わる
- メニュー以外の場所をクリックするか `Escape` を押すとメニューが閉じる
- メニューを操作しても本文のキャレット位置を失わない

## Slashコマンド

- `/` で Slash メニューを開ける
- Slash メニュー以外の場所をクリックすると閉じる
- Slash メニューを開き直すとスクロール位置と選択位置が先頭へ戻る
- 検索文字が変わるとスクロール位置と選択位置が先頭へ戻る
- `/heading` などの入力で候補を絞り込める
- 一致する候補がない場合は該当なし表示になり、`Enter` で別のブロックへ誤変換しない
- キーボードで候補を選択できる
- キーボードで選択中の候補が常にスクロール範囲内へ表示される
- `Tab` で候補選択を進められる
- `Enter` で選択したブロックを作れる
- `Escape` でメニューを閉じられる
- ページスクロール時は入力元へ追従し、画面サイズ変更やウィンドウ切り替えで古い位置に残らない
- 狭い画面でもメニューが画面外にはみ出さない
- 既存ブロックの近くに正しく挿入される
- 候補は日本語ラベル（段落・見出し1 など）で表示され、英語名(/table などの綴り)も説明側に残る
- 日本語入力の変換中（composition 中）はメニューを開閉せず、確定した時点で判定する

## ブロック操作

- **ハンドル(⋮⋮)の左クリックでブロックのメニューが開く**(v125。Notion 準拠)
  - クリックで**ブロックが選ばれる**のは従来どおり。そのうえでメニューが開き、検索欄にフォーカスが入る
  - **ドラッグは従来どおり**。動かさずに離したクリックだけがメニューを開く
    (区別は既存の `onGripPointerUp` の `!active` 判定。新しい閾値は作っていない)
  - 中身: 検索欄 / いまのブロック種別 / **ブロックタイプの変換**(現在の種別に ✓) / 複製 / 上へ・下へ移動 / 削除
  - **変換先は「本文テキストだけで表せる18種」**(段落・見出し1〜5・トグル見出し1〜5・箇条書き・番号・
    ToDo・トグル・引用・コード・数式)。**表・添付・区切り線・グラフは出さない**(内容が失われるため)
  - **構造ブロックでもメニュー自体は出る**(複製・移動・削除は使える)。出さないのは変換の段だけ
  - **仕様: トグル系どうしの変換では必ず開いた状態になる**(閉じたトグル→トグル見出しで中身が見える)。
    変換は種別の付け替えであって開閉状態の記憶ではない。トグル→段落でも**子ブロックは残る**
  - **仕様: コード/数式へ変換すると装飾(太字など)は失われる**(素のテキストしか持てないため)。
    Undo 1手で書式ごと戻る。逆方向(コード→段落)は本文がそのまま残る
  - **メニューが開いている間、修飾キー無しのキーはメニューのもの**。ただし検索欄にまだ何も打っていなければ、
    Delete / Backspace は選んだブロックを消し、Ctrl+C / Ctrl+X はブロックのコピー・切り取りになってメニューが閉じる(v208。ユーザー指示)。
    検索欄に一度打ったら、Backspace / Delete は検索欄のもの(打ち直しの Backspace がブロック削除にならない)
  - **Esc で閉じるとブロックの選択は残る**ので、続けて Delete で消せる
  - 変換・複製・移動・削除はいずれも Undo 1手
  - 対応するテスト: `blockMenuOpensFromGrip` `blockMenuChecksCurrentType` `blockMenuOffersTextTypesOnly`
    `blockMenuHidesConvertForStructuralBlock` `toggleToParagraphKeepsChildren`
    `toggleConversionOpensCollapsedToggle` `blockMenuCodeRoundTripDropsFormat`
    `blockMenuSwallowsDeleteWhileOpen` `blockMenuDeleteWorksAfterEscape` `blockMenuStaysClosedAfterDrag`
    `gripMenuDeleteRemovesBlock` `gripMenuCtrlCCopiesBlock` `gripMenuCtrlXCutsBlock` `gripMenuSearchBackspaceKeepsBlock` ほか


- **移動は常に部分木ごと**(親を動かすと子孫がついてくる。子を動かすと孫はついてきて親は残る)
  - 経路: ドラッグ上下(moveBlockTo)・段組み化/列間ドラッグ(moveBlockToColumn)・
    パレットの Move block up/down(moveBlock)。すべて subtreeRange で範囲を決める
  - 根のインデントは移動先(ターゲット)の階層に合わせ、子孫は相対差を維持する
  - 自分の子の中へ落としたときは、そのブロックだけが移る(子はその場に残る。v211)
    (Notion のドロップと同じ規則。v110)
  - 折りたたんだトグルの移動は、隠れた子ごと動く(見えない子を置き去りにしない)
  - 移動は Undo 1手で順序もインデントも丸ごと戻る
  - ブロック選択中の ↑↓ は「選択の移動」でありブロックは動かない(移動経路ではない)
  - Ctrl+C/Ctrl+V のブロック複製も部分木ごと(selectedBlockRanges)。貼り付け先の
    インデントに根を合わせ、子孫は相対差を維持(既存仕様)
  - 対応するテスト: `subtreeMoveChildCarriesGrandchild` `subtreeMoveUndoRestores`
    `dragMovesSubtreeTogether` `columnDragMovesSubtree`

- ブロックにマウスを乗せると、ドラッグハンドルの左側に ＋ ボタンが現れる
- ＋ を押すとそのブロックの直下に空ブロックが増え、そこへフォーカスが移る
- ＋ で追加したブロックを Undo で取り消せる
- ＋ で足すのは空の段落だけで、種類のメニューは開かない(v206。ユーザー指示)。打った文字は本文になり、`/` で種類を選べる
- 空のブロックの「Type / for commands」は、カーソルのあるブロックだけに見える(v206。ほかでは透明にして高さは変えない)
- ページのブロックを1つ選んで `Tab` で、すぐ上のページの子ページになる。`Shift+Tab` で親のページへ戻る(v206)
- ドラッグハンドルでブロックを移動できる
- ブロック中央へのドラッグでは列化せず、従来どおり上下へ移動できる
- ドラッグハンドルをクリックするとブロックを選択できる
- 本文の外（左の余白など）を押してドラッグすると矩形が出て、重なったブロックをまとめて選択できる
  - ドラッグ中は矩形が表示され、離すと消える。選択はそのまま残る
  - ドラッグ中も、重なったブロックの選択が随時更新される
  - 選択した複数ブロックを `Delete` でまとめて削除でき、`Ctrl+Z` で戻せる
  - 選択した複数ブロックを `Ctrl+C` `Ctrl+V` でまとめて複製できる
  - **ドラッグ中にスクロールしても(ホイール・タッチパッド・スクロールバー)、開始点は始めたブロックに留まる**
  - **ドラッグしたまま画面の下端(上端)の近くへ持っていくと、自動でスクロールして選択が伸びる**。端に近いほど速く、
    端から離すか手を離すと止まる
- **ドラッグ中の端での自動スクロール**(v151)は、次の操作すべてで同じように働く: 矩形選択・ブロックのドラッグ(ハンドル)・
  ブロックをまたぐ文字の選択・表のセル範囲の選択と数式の参照・フィルハンドル・外からのファイルのドラッグ
  - 端の近く(またはその外)で 0.2 秒とどまると始まる(端の近くで素早く離すだけなら、勝手にスクロールしない)
  - スクロールしている間も、落とし先・選択・範囲・フィルの予告がポインタの位置へ追従して伸びる
  - 段組みの幅・画像の幅・表の列幅のドラッグは対象外(横方向の幅の変更)
  - **縦だけ**(仕様)。横に長い表でセル範囲を右へ広げるときの横スクロールは未対応
  - ドラッグ中に窓の外でボタンを離した・別のウィンドウへ移った・タブを切り替えたときは、ドラッグと自動スクロールが
    止まる(選択はそのまま残り、ブロックの移動とフィルは取り消される)
  - 外からのファイルのドラッグで、ブラウザ自身の自動スクロールと二重に速くならないかは**未確認**(実機での確認が必要)
  - 文字の選択でスクロールしても、選択の始まりは始めた位置のまま(別のブロックから選ばれない)
  - 対応するテスト: `blockDragAutoScrollsAtEdge` `textSelectionAutoScrollsAtEdge` `tableRangeAutoScrollsAtEdge`
    `fillHandleAutoScrollsAtEdge` `fileDragAutoScrollsAtEdge` `quickReleaseNearEdgeDoesNotScroll`(矩形選択は `marqueeAutoScrollsAtEdge`)
    `lostReleaseEndsBlockDrag` `lostReleaseEndsMarquee` `blurEndsMarqueeAutoScroll` `hiddenEndsTextSelectionAutoScroll`
  - `Escape` または選択の外をクリックで解除できる
  - 動かさずにクリックしただけのときは矩形選択にならず、従来どおり末尾へフォーカスする
  - 本文の文字の上から始めたドラッグは、従来どおり文字の範囲選択になる
- ブロックを選択している状態の `Ctrl+C` `Ctrl+V` で、そのブロックの複製を直下に作れる
  - **コピーは OS のクリップボードへ**(v147)。キャレットを置いた場所で `Ctrl+V` するとブロックとして貼り付く
    (キャレットのブロックの後ろ。空の段落なら置き換え)。別のページ・別のタブの同じエディタへも貼れる
  - 種類・字下げの階層・書式・表の中身・グラフ・添付がそのまま貼り付く。ID は、文書の中にまだ無ければそのまま使い、あれば新しくする
    (移動では保たれ、複製では新しくなる。同じ貼り付けの組の中の表を読むグラフは、組の中の新しい id へ付け替える。v158)
  - 添付の中身はクリップボードに載せない。同じ文書の中なら、元を消した後でも・切り取った後でも添付ごと戻る。
    別の文書へ貼ると「添付が見つかりません(ファイル名)」と見える形で残る
  - ブロックをコピーした後に文字をコピーすると、次の `Ctrl+V` は文字になる(古いブロックは貼られない)
  - **`Ctrl+V` はコピー元に従う**(v149): ブロックをコピーしていれば、キャレットを置いただけでもブロックとして貼られる
    (ブロックを選択しておく必要は無い)。文字のコピーなら文字として
  - **`Ctrl+Shift+V`(Mac は `Cmd+Shift+V`)は書式なしで貼る**: ブロックをコピーしていても文字として、太字などの
    書式つきの文字をコピーしていても書式を落として、キャレットの位置へ入る。その直後の `Ctrl+V` は元どおりコピー元に従う
  - **注意(P21)**: 書式なしの「印」(keydown で立てて paste で読む)は **macOS・Tauri 向けの保険**。Chromium は
    `Ctrl+Shift+V` のとき自分で text/plain しか渡さないので、印が効いていることは **Chromium のテストでは検証できていない**
    (印を外しても緑のまま)。**macOS と Tauri(WebView2)のイベントの順番は未実測**
  - 書式なし貼り付けの保険(クリップボードの文字を読んで貼る)で貼った直後に、遅れて paste が届いても二重に入らない
  - 消した添付の控えは新しい 20 件まで。それより古い添付を貼ると「添付が見つかりません(ファイル名)」になる
  - 画像を切り取って保存してから貼り付けても、画像は戻る(保存で控えを消さない)
  - `Ctrl+X` で切り取れる。切り取り・貼り付けとも `Ctrl+Z` 1回で戻る
  - ほかのアプリへ貼ると、本文の文字(表はタブ区切り)や HTML として読める
  - ページブロックは、同じ文書なら同じページへのリンクが増えるだけ(新しいページは作らない)。別の文書へ貼ると
    そのページの題名だけの段落になる
  - 貼り付けた内容も、開いたファイルと同じく無害化される(グラフの SVG のスクリプト・添付の ID)
  - 対応するテスト: `blockCopyPasteKeepsStructure` `blockCopyPutsPlainText` `blockPasteWorksInAnotherTab`
    `blockCutPasteUndoRestores` `marqueeKeepsStartWhileScrolling` `marqueeAutoScrollsAtEdge` `pastedBlocksAreSanitized`
    `textCopyAfterBlockCopyPastesText` `cutPasteRestoresImageAttachment` `clipboardOmitsAttachmentData`
    `crossDocumentPasteKeepsVisibleNames` `clipboardEventHasNoShiftKey` `plainPasteInsertsBlocksAsText`
    `normalPasteAfterPlainPasteUsesBlocks` `plainPasteFlagExpiresWithoutPaste` `plainPasteDropsFormatting`
    `latePasteAfterFallbackIsIgnored` `detachedAttachmentsAreCapped` `cutSavePasteRestoresImage`
  - 装飾（太字・色・フォントなど）ごと複製される
  - 子ブロックを持つブロックは、子もまとめて複製される（削除と同じ範囲）
  - 作った複製が選択状態になり、続けて `Ctrl+V` で増やせる
  - `Ctrl+Z` で複製を取り消せる
  - 本文のテキストを選んでいるときは、従来どおりの文字のコピー・貼り付けになる
- 選択したブロックを `Delete` で削除できる
- 削除したブロックを Undo で戻せる
- Redo で削除をやり直せる
- 複数ブロックをまたいでドラッグで選べる(離すとブロックの選択になる。v206)
- ダブルクリックで単語を選択できる
- トリプルクリックで行(ブロック)全体を選択できる
- ダブルクリックで選んだ単語は、続けて入力して置き換えられる
- トリプルクリックの直後に同じ場所をクリックすると選択が解除される
- 選択されているテキストの上をクリックすると、選択が解除されてクリック位置へキャレットが移る
- 最後のブロックでも同じように選択が解除される
- 複数クリックのあともブロックは編集可能なまま保たれる
- 余白クリックで文末にフォーカスできる

## 階層番号付きリスト

- 第1階層は `1.`、`2.`、`3.` の形式で連番になる
- 第2階層は親番号を含む `1.1`、`1.2` の形式で連番になる
- 第3階層以降も `1.2.1` のように親階層の番号をすべて含む
- `Enter` で同じ階層の番号付き項目を続けて作れる
- `Tab` / `Shift+Tab` で階層を変えると、番号がその場で正しく振り直される
- 通常ブロックを挟むと新しい番号付きリストとして `1.` から始まる
- 列レイアウト内では列ごとに番号が独立する
- 保存HTMLと開き直した文書でも階層と番号表示が保持される

## 列レイアウト

- ブロックを別ブロックの左右端へドラッグすると2列に配置できる
- 列内のブロックを左右端へドラッグすると3列に配置できる
- 列は8列まで作れる(v262。#142。以前は3列)。上限は `fmt.MAX_COLUMNS` の1か所(`columnLimitSuite`)
  - 8列の右端へドラッグしても9列目は作らず、その列の中へ入る。ドラッグ中も右に列を作る印を出さない(`rightMarkHiddenAtLimit` `ninthColumnIsPrevented`)
  - 9列以上の文書を開くと、9列目より右の中身は8列目の下に並ぶ(文字は消さない)。保存すると8列(`tenColumnDocumentFoldsIntoEight` `tenColumnDocumentSavesAsEight`)
  - 列が増えると本文はとても細くなる(8列・幅1400pxで本文47px)。細さには手を入れない(ユーザー決定。何列使うかは見やすさで選ぶ)
- 列内で `Enter` を押すと同じ列に次のブロックを作れる
- 列内でブロックを上下に並べ替えられる
- ブロックを列の外へドラッグして通常幅へ戻せる
- 空になった列は自動で削除される
- 1列だけ残った列レイアウトは通常のブロック配置へ戻る
- 列の境界をドラッグまたは矢印キーで動かして列幅を変更できる
- 列の作成、解除、幅変更を Undo / Redo できる
- 狭い画面では列が横にはみ出さず縦に並ぶ
- 保存HTMLでも列構成と列幅が再現される
- 保存HTMLを再読込しても列情報が保持される
- トグルの中にも段組みを置ける(v256。Issue #133)。段組みは組ごと1つのブロックとして、組の中で一番浅い字下げにあるものと見なす
  (`fmt.columnRun`)。トグルを閉じると段組みとその後ろの中身も隠れ、保存HTML・印刷ではトグルの `<details>` の中に書き出す。
  対応するテスト: `closingToggleHidesColumnsInside` `savedHtmlKeepsColumnsInsideToggle`
- トグルの外の段組みは、保存HTMLでは以前と同じく一番上の段に書き出す(字下げは列の中で付く)。対応するテスト: `columnsOutsideToggleExportUnchanged`
- トグルを動かす・複製する・(閉じたトグルを)字下げすると、中の段組みも組のまま一緒に動く(複製は別の組になる)。
  対応するテスト: `movingToggleCarriesColumns` `duplicatingToggleCopiesColumns` `indentingClosedToggleShiftsColumns`
- 目次から段組みの中の見出しへ飛ぶと、外の閉じたトグルが開く。対応するテスト: `tocJumpOpensToggleAroundColumns`
- 段組みの中に段組みは作らない: 段組みを含む部分木は、段組みの列の中へ動かさず(段組みにもしない)、知らせる。
  対応するテスト: `columnsNotNestedInColumns`

## トグル

- 開閉の三角マーク(▸/▾)は本文の約2倍の大きさ(font-size 28px・箱30×30px の
  クリック当たり判定)。縦位置は1行目の中心(`--first-line-center`)に合う。
  対応するテスト: `toggleCaretIsDoubled`
- 箇条書きのドット(•)も同じ流儀で約2倍(font-size 28px)。ドット中心の縦横位置は維持
  (ドットの形は全レベル共通の • なので、レベル別の形状違いは無い)。
  対応するテスト: `bulletMarkerIsDoubled`
- **保存HTML側もエディタと同じ大きさに揃える**(v112): ブラウザ既定マーカーを消し、
  同じグリフ(▸/▾・•)を 28px の ::before で自前描画する。details の開閉機能は標準のまま。
  対応するテスト: `exportedMarkersMatchEditorSize`(書き出しHTMLを実際に描画して
  computed の ::before font-size とグリフを確認)
- 保存HTML側のトグルはネイティブの `<details><summary>`(ブラウザ標準のマーカー)なので
  エディタの三角サイズ変更の対象外

- トグルリストを作れる
- トグル見出しを作れる
- トグルの下にネストしたブロックを作れる
- トグルを閉じると子ブロックが隠れる
- トグルを開くと子ブロックが再表示される
- トグルリストで `Enter` を押すと適切なインデントを維持できる

## テーブル

- 表の全画面の編集(v238): 帯の「全画面」で、表だけを画面の幅いっぱいに。ほかは隠す。全画面のまま編集・Undo できる。Esc は編集を取り消してから閉じる。
  閉じたらスクロールの位置が戻る。保存には残らない。別のページへ移ったら抜ける
  → `tableFocusOpens1280` `tableFocusOpens800` `tableFocusEditsInPlace1280` `tableFocusEscCancelsThenCloses1280` `tableFocusCloseButtonAndNotSaved` `tableFocusEndsOnPageChange`
  - 全画面の見出し(Excel): 押して選ぶ・ドラッグ/Shift で複数・角で全部・境目で幅・選んだ列を動かす・スクロールでとどまる・右クリックの挿入削除(Undo 1手)・式の途中なら参照
    → `tableSheetHeadersShown` `tableSheetHeaderSelects` `tableSheetHeaderResizesColumn` `tableSheetHeaderDragMoves` `tableSheetHeaderSticks` `tableSheetHeaderMenu` `tableSheetHeaderInsertsRefWhileEditingFormula`
  - 複数の列を選んでいるとき、境目のダブルクリックは全部を自動調整・ドラッグは全部を同じ幅(Undo 1手)
    → `tableSheetMultiColumnAutoFit` `tableSheetMultiColumnDragSameWidth`
  - 見せる高さ(v235)を決めた表も、全画面では全行(閉じたら高さに戻る。決めた高さは残る) → `tableFocusIgnoresViewHeight`
- 行の高さ(v238。形式 0.8.13): ドラッグ・保存・保存HTML・開き直し・Undo 1手・ダブルクリックで中身に合わせる・↑↓キー・挿入/削除/並べ替えでついていく・
  全画面で複数の行に効く・右クリックの自動調整
  → `tableRowHeightDragAndSave` `tableRowHeightUndoOneStep` `tableRowHeightAutoFitAndKeys` `tableRowHeightFollowsRows` `tableRowHeightSheetMulti`
- 列の幅・行の高さのドラッグ中も、番号・見出し・つまみがついてくる(ふだん・全画面、列・行) → `tableResizeHandlesFollowDuringDrag`
- 行・列の挿入、ヘッダー行・列の切り替えで、カーソルは今のセルから動かない(v239)。消したときは同じ番号の位置。Tab で最後から足したときだけ新しい行へ
  → `tableInsertKeepsActiveCell` `tableHeaderToggleKeepsActiveCell` `tableDeleteMovesToSamePosition` `tableTabAtEndStillMovesToNewRow`

- Excel の基本機能(v232)
  - Shift+矢印で範囲を広げる・縮める(セルの端でだけ。文字の途中は文字の選択)。範囲が無くても Shift+クリックで範囲
    → `tableShiftArrowExtendsRange` `tableShiftArrowInsideTextSelectsText` `tableShiftClickStartsRangeFromActiveCell`
  - 配置(左・中央・右)。範囲に効く。もう一度で外す。Undo 1手。Tx で外れる。保存HTMLも同じ
    → `tableAlignAppliesToRange` `tableAlignSavedHtml` `tableAlignUndoToggleAndReset`
  - 数の見せ方(桁区切り・パーセント・小数の桁)。式の結果にも効く。編集中・コピーは元の値。保存HTMLも同じ。Undo 1手
    → `tableNumberFormatShows` `tableNumberFormatEditsRawAndCopiesRaw` `tableNumberFormatSavedHtml` `tableNumberFormatUndo`
  - 関数・比べる・文字・&(IF は選ばなかった側を計算しない)。文字の中の参照は書き換えない
    → `tableFunctionsBasic` `tableFunctionsCount` `tableFunctionsConditional` `tableFormulaStringNotRewritten`
  - $ の絶対参照: フィルで動かない・挿入にはついていく・F4 で切り替え
    → `tableAbsoluteRefFill` `tableAbsoluteRefFollowsInsert` `tableAbsoluteRefF4Cycles`
  - 並べ替え: 見出しは動かない・空は最後・同じ行を指す式は同じ行のまま・範囲とグラフはそのまま・Undo 1手・縦の結合では使わない
    → `tableSortOrdersBody` `tableSortFormulasFollow` `tableSortUndoOneStep` `tableSortRefusesVerticalMerge`
  - 並べ替えの式は Excel と同じく「行を新しい位置へコピーした」扱い(v246。Issue #87): 相対の行がずれる・$ の行は動かない・累計は並べ替えた順で計算し直す
    → `tableSortShiftsRelativeRows` `tableSortRecomputesRunningTotal`(tableCutSortSuite)
  - 絞り込み: 値の一覧で隠す・表の下に一言・↓は隠した行を飛ばす・消去とコピーは見えている行だけ・保存HTMLでも隠す・列の挿入でずれる・Undo・すべて解除
    → `tableFilterHidesRows` `tableFilterKeysAndRangeSkipHidden` `tableFilterSavedHtml` `tableFilterFollowsColumnInsert` `tableFilterUndoAndClear`
  - 範囲の切り取り→貼り付け(v246。Issue #87。Excel と同じ): 切り取りでは消さず点線で囲む・同じ表へ貼ると式ごと移る・移したセルを指す式とグラフは
    移した先を指す(範囲は全部が中のときだけ)・上書きされたセルを指す参照は #REF・Undo 1手・Esc / ほかの編集でやめる・表の外へ貼っても元は残る・
    別の表へ貼ると値を貼って元を空にする・結合が掛かれば移さない。絞り込みで隠れた行を含む切り取りは、今までどおりその場で空にする
    → `tableCutKeepsCellsUntilPaste` `tableCutPasteMovesFormulas` `tableCutPasteMovesChartRange` `tableCutPasteUndoOneStep` `tableCutEscCancels`
    `tableCutEditCancels` `tableCutPasteOutsideKeepsSource` `tableCutPasteOtherTableMovesValues` `tableCutPasteOtherTableUndoOneStep` `tableCutPasteRefusesMerged`(tableCutSortSuite)

- 本文の欄より広い表は、表の中で横にスクロールできる(v231)。番号・取っ手は見えている範囲だけ。セルに入るとセル全体が見えるまで動く。
- 長い表は、表の下の端のつまみをドラッグして見せる高さを決められる(v235。超える分は表の中でスクロール、見出しの行は上に残る。ダブルクリックで
  全部見せる。保存HTMLも同じ。印刷では全行。ロック中はつまみなし)
  → `tableHeightPlainShowsAll` `tableHeightDragLimits` `tableHeightHeaderStaysOnTop` `tableHeightLabelsOnlyForVisibleRows` `tableHeightSavedHtmlSameView`
  `tableHeightPrintShowsAllRows` `tableHeightReopens` `tableHeightDoubleClickShowsAll` `tableHeightUndoRestores` `tableHeightSanitizedOnOpen` `tableHeightLockedHasNoGrip`
  描き直し・ページの行き来でも横の位置は戻らない。列のドラッグは左右の端で横に自動スクロール。保存HTMLも箱の中で横スクロール、印刷は紙の幅に縮める
  → `tableWideScrolls1100` `tableWideScrolls800` `tableWideLabelsStayInView1100` `tableWideLabelsStayInView800` `tableWideKeepsScrollOnRender1100`
    `tableWideKeepsScrollAcrossPages1100` `tableWideColumnDragAutoScrolls` `tableWideSavedHtmlScrolls` `tableWidePrintFitsPage`

- 行・列を取っ手のドラッグで入れ替えられる(v230)。移動先に線。押すだけなら選択。Esc でやめる。Ctrl+Z 1回で戻る
  → `tableMoveShowsDropLine` `tableMoveRowWithinRange` `tableMoveUndoInOneStep` `tableMoveClickStillSelects` `tableMoveEscapeCancels`
  - 式: 1つのセルはついていく。範囲は中で動かせばそのまま、外へ出せば抜ける。グラフの範囲も同じ
    → `tableMoveRowOutOfRange` `tableMoveChartRangeStaysWithinRange` `tableMoveChartRangeFollows` `tableMoveColumnRefsFollow`
  - 列幅・データベースの列の種類も一緒に動く。ヘッダー行・列、データベースの1行目、結合を分ける移動はしない
    → `tableMoveColumnCarriesTypesAndWidths` `tableMoveKeepsHeaderRow` `tableMoveKeepsDatabaseNamesRow` `tableMoveRespectsMerges`
  - 行のドラッグで画面の上下の端にとどまると自動スクロール。窓の外で離したら動かさない
    → `tableMoveAutoScrollsAtEdge` `tableMoveLostReleaseCancels`

- 表をデータベースにできる(v229)。表の道具の帯の右端「データベース」・つまみのメニュー。1行目が列の名前。表に戻すと文字はそのまま
  → `tableDbToggleTurnsOn` `tableDbToggleUndoesInOneStep` `tableDbBlockMenuTurnsBack`
  - 列の種類(文字・数・日付・選択肢・チェック・リンク)を列の名前の左の印から選ぶ。選択肢は札、数は右寄せ、チェックは四角、リンクは題名
    → `tableDbColumnTypesShow` `tableDbTypeChangeUndoes` `tableDbCheckToggles` `tableDbSelectOffersColumnValues`
  - リンク: HTML を落とすと題名を読む。読めなければ元のまま。javascript: は受けない
    → `tableDbLinkDropReadsTitle` `tableDbLinkKeepsTitleWhenUnreadable` `tableDbLinkRejectsUnsafeHref`
  - リンクの行き先に同じ文書のページ(v267 #147): 「ページを選ぶ…」で選ぶ・Ctrl+クリックで移る・題名を変えると文字が元の題名のセルはついてくる・
    ページを消すと文字を残して行き先だけ外れる(確認に数が出る)・ロック中のページのセルが指すページは消せない・保存HTMLでも移る・
    別の文書へ貼ると無いページへの行き先は外れる
    → `dbPageLinkCtrlClickSwitches` `dbPageLinkPickerChooses` `dbPageLinkTitleFollows` `dbPageLinkDeleteKeepsText` `dbPageLinkLockedLinkerBlocksDelete`
      `dbPageLinkSavedHtmlSwitches` `dbPageLinkPasteDropsMissingPages`
  - リンクの列のセルへ URL をそのまま打つ(貼る)と、その URL へのリンクになる(行き先が空のとき。v268)。ふつうの文字はリンクにしない
    → `dbLinkTypedUrlBecomesLink`
  - ふつうの表のセルにもリンク(v269。形式 0.8.15): 上のリンクのボタンで行き先の窓(太字などは押せないまま)・ページを選ぶ・URL を打つ・
    HTML を落とす・Ctrl+クリック・保存HTMLと開き直し。選択肢・チェックの列には付けない
    → `cellLinkButtonWorksInTable` `cellLinkPagePickInTable` `cellLinkTypedUrlInTable` `cellLinkHtmlDropInTable` `tableLinkCtrlClickOpens`
      `cellLinkRefusedOnSelectColumn` `cellLinkSavedInTable`
  - セルの手伝いは、下に入りきらなければセルの上に出る(画面の下の方のセルで一覧を開いても切れない) → `dbPageLinkHelperStaysInView`
  - 結合のある表は確かめてから外す(やめると何も変えない)。Ctrl+Z 1回で結合ごと戻る
    → `tableDbMergeAsksAndCancelKeeps` `tableDbMergeOkUnmergesKeepingTopLeft` `tableDbMergeUndoRestoresInOneStep`
  - 列の追加・削除で種類も動く。保存・開き直しで残る。保存HTMLも同じ見た目。データベースではヘッダー行を外せない
    → `tableDbColumnTypesFollowColumns` `tableDbSavesAndReopens` `tableDbSavedHtmlShowsTypes` `tableDbReopenKeepsTypes` `tableDbKeepsHeaderRow`

- テーブルブロックを作れる
- セルに入力できる
- テーブル作成後も他のブロック操作が壊れない
- セル内で `Backspace` を押しても、テーブルブロックごと削除されない
- 文字が入ったセルで `Backspace` を押すと、1文字だけ削除できる
- セル内の `↑` `↓` で、同じ列の上下のセルへ移動できる(Excel / スプレッドシート風)
  - 折り返しで複数行になったセルでは、セル内の行移動が優先され、端の表示行でだけセルを移る
    (行の判定はテキストの改行位置ではなく描画矩形で行う)
  - 結合で覆われた位置は飛ばして、覆っている本体のセルへ移る
  - 縦に結合したセルからの `↓` は、結合の下端の次の行へ移る
  - ヘッダー行(th)でも同じように行き来できる
  - 先頭行の `↑`(キャレットが文頭のとき)と最終行の `↓` は、これまでどおり表の外のブロックへ出る
  - 移動先が表の端のセル(右下や空の先頭セル)でも、表の外へ抜けずにそのセルに留まる
  - 対応するテスト: `tableArrowDownMovesToCellBelow` `tableArrowUpMovesToCellAbove`
    `tableArrowUpAtTopLeavesTable` `tableArrowDownAtBottomLeavesTable`
    `tableArrowUpStaysInsideMultilineCell` `tableArrowUpLeavesMultilineCellAtTopLine`
    `tableArrowMovesAcrossHeaderRow` `tableArrowUpSkipsCoveredCell`
    `tableArrowDownFromMergedCellSkipsCoveredRows`
    `tableArrowDownIntoLastCellStays` `tableArrowUpIntoEmptyTopCellStays`
- セル内の `←` `→` で、文字端にいるときだけ隣のセルへ移動できる(Notion / Google ドキュメントの表と同じ読み順)
  - `→` は本文末尾にいるときだけ右隣へ(移動先のキャレットは先頭)。途中では既定のキャレット移動のまま
  - `←` は本文先頭にいるときだけ左隣へ(移動先のキャレットは末尾)。途中では既定のまま
  - 行の右端の `→` は次の行の先頭セルへ、行の左端の `←` は前の行の末尾セルへ折り返す
  - 表全体の最後のセルの `→` は次のブロックへ、先頭セルの `←` は前のブロックへ出る
  - 結合で覆われた位置は、覆っている本体のセルへ移る
  - ヘッダー行(th)でも同じように行き来できる
  - セル移動が成立した keydown は伝播も止める(Bug-T1 と同じ轍を踏まない)
  - 対応するテスト: `tableArrowRightAtEndMovesToNextCell` `tableArrowLeftAtStartMovesToPreviousCell`
    `tableArrowSidewaysMidTextStaysInCell` `tableArrowRightWrapsToNextRow`
    `tableArrowLeftWrapsToPreviousRowEnd` `tableArrowRightAtLastCellLeavesTable`
    `tableArrowLeftAtFirstCellLeavesTable` `tableArrowRightWorksInHeaderRow`
    `tableArrowLeftSkipsCoveredCell`

## 提案(v240。形式 0.8.14)

- AI 向けの案内(docs/format/index.md)の書き戻しの例と提案の例が、そのまま動く(開くと提案が出る) → `aiGuideSnippetAddsSuggestion` `aiGuideExampleOpensAsSuggestions`
- 保存ファイルの先頭の注釈は、構成の事実と案内へのリンクだけ(書き方の決まりは書かない) → `aiGuideLinkInFile`
- 人・AI・道具が書いた提案を開くと、本文に差分(消す=赤の取り消し線、足す=緑、足すブロック=仮の行、消すブロック=薄い赤)、右に提案の木。
  上の帯に「提案 N」。id・before の無い提案(AI が書いた形)も開ける → `suggestOpenShowsDiffAndPane`
- 語句は数・単位の途中で切らない(25℃ → 23±2℃) → `suggestPhrasesKeepNumbersWhole`
- 木の途中の段(列)のチェックを外して「選んだ所を採用」→ 外した所は提案のまま残る → `suggestUncheckedColumnStaysPending`
- 表の範囲を選ぶと、その範囲の提案だけ決める帯 → `suggestRangeBarDecidesSelectedCells`
- 語句にマウスを乗せて出る帯で採用・戻す → `suggestPhraseDecidedFromPopup`
- 決めたのは Undo 1手で戻る → `suggestUndoRestoresDecision`
- すべて採用(足す・消す・セル・語句) → `suggestAcceptAllApplies`。すべて戻す(中身は変わらない) → `suggestRejectAllKeepsContent`
- 保存すると、結果(accepted / rejected / partial・語句ごと)と前の値が提案に残る。開き直すと決め終わった提案は出ない
  → `suggestSavedWithResults` `suggestReopenKeepsDecisions`
- 付いているチェック(緑の地に白の ✓)・主ボタン(適用)に、マウスを乗せても地の色が変わらない(1280・800 の両方)。状態を地で見せるほかのボタンも保たれ、ふだんのボタンの hover は薄い灰のまま → `hoverKeepsCheckedBox1280` `hoverKeepsCheckedBox800` `hoverKeepsLinkApply1280` `hoverKeepsLinkApply800` `hoverKeepsOtherStateButtons` `hoverPlainButtonsStaySoft`
- 提案の無い文書の manifest には suggestions を書かない → `suggestPlainManifestHasNoSuggestions`
- 書いた後に元が変わった提案は「古い」: 採用できない、戻すだけ → `suggestStaleCannotBeAccepted`
- 細工した提案(スクリプト・図の絵)は何も動かない → `suggestHostileContentIsInert` `suggestInsertItemHasNoPictures`
- 式のセルへの提案: 隣のセルを打って計算し直されても、差分(前の式と提案の式)が見えたまま → `suggestFormulaCellKeepsDiff`
- レビュー(PR #79)の直し(v241): 提案中の段落とはつながない → `suggestReviewMergeKeepsDiffOut`。同じブロックの消す+書き換えを一緒に採用
  → `suggestReviewDeleteAndSetTogether`。同じセルへの2つの提案は先だけ入る → `suggestReviewSecondOnSameCellNotApplied`。足すブロックの直し
  → `suggestReviewInsertIsSanitized`。書式・参照の印を残す → `suggestReviewFormattingKept`。同じ所に2つ足す順 → `suggestReviewInsertOrderKept`。
  細工した行き先 → `suggestReviewHostileTargetDropped`。id の重なり → `suggestReviewDuplicateIdsSeparated`
- 2回目の確認の直し(v242): ブロックを選んだ書式・書式のクリアは提案中の段落を飛ばす → `suggestReviewBlockFormatSkipsDiff`。提案だけが使う添付が
  残る・開くときの添付の id の付け直しが届く → `suggestReviewSuggestionAttachmentsKept`。段落ごとの書き換えは html と text が合うときだけ・
  書式とリンクの行き先を見せる → `suggestReviewWholeHtmlMustMatchText`。何も当てられなければ Undo の段・未保存の印を付けない
  → `suggestReviewNoopLeavesNoUndoOrDirty`。insertedId は採用済みだけ → `suggestReviewForgedInsertedIdDropped`
- 提案の欄と、メニュー類・上の道具の帯の一覧の重なり(v284・v285。Issue #243): メニュー類は横の欄より上 → `popoversAboveSidePanes`。提案の欄を開いたまま、
  1280px・800px とも、欄が帯の下端から始まり、書体・大きさ・文字色・背景色のボタンを押せて一覧が隠れない → `toolbarMenusAboveSuggestPane`
- 3回目の確認の直し(v243): パネルを開いたままでも検索・置換の「すべて置換」が押せる(パネルはバーの下から) → `suggestReviewPaneLeavesSearchBarFree`。
  提案中の段落でも検索の色は一致した文字に付く → `suggestReviewSearchPaintsMatchedText`
- 既知の制限: 書式のある段落は、差分を見ている間は書式なしで見える(採用すると書式は残る)。参照の印・コード・数式の途中にかかる語句は
  採用できない。提案中の所は打てない・つなげない(決めてから打つ)。足せるのはブロックの追加・削除・文字・セルだけ
  (表の行・列の増減、ブロックの並べ替えはまだ)。ファイルが外で書き換わったのは見ていない(開き直すと出る)。

## 文書チェック(v289。Issue #236)

- 入口: File メニューの「文書をチェック…」・コマンドパレット → `checkMenuItem` `checkPaletteCommand`。新しいファイルは配る場所の全部に入る → `checkFileIsShipped`
- 判定は既存の窓口(表の式の語彙は formulaErrorOf の1か所。参照・数式・グラフも表示と同じ関数) → `checkReusesExistingJudgement`
- 正常な文書は「見つかった問題はありません」。「問題なし」は正しさの保証ではない・外部のリンクは調べないと書く → `checkHealthyIsOk` `checkOkIsNotAGuarantee`
- 見ていないページの各種の不整合: 参照先なし(消した・ゴミ箱・題名を外した)・ブロックへのリンク・閉じたトグルの中・ページのブロック・表のリンクのセル・
  文書に無い添付・表の式(#ERR・#CYCLE・#REF・0 で割る)・グラフ(使えないコマンド・データの表が無い)・数式(ブロック・文中)・図(Mermaid の文法の誤り)
  → `checkFindsMissingReference` `checkFindsMissingBlockLink` `checkFindsTrashReference` `checkFindsUncaptionedTarget` `checkFindsInsideClosedToggle`
  `checkFindsMissingPageBlock` `checkFindsMissingAttachment` `checkFindsBrokenCellLinks` `checkFindsFormulaErrors` `checkFindsChartError` `checkFindsMathErrors`
  `checkFindsMermaidError`。正常な所は出さない → `checkHealthyPartsNotListed`
- チェックの前後で文書が変わらない(画面の値・保存の結果) → `checkDoesNotChangeDocument`
- 選ぶと移る(別のページ・閉じたトグルを開く・セルを光らせる)。トグルを開いたのは「変わりました」に数えない → `checkJumpOpensPageAndToggle` `checkJumpFlashesCell` `checkJumpIsNotAnEdit`
- 直すと「変わりました」、再チェックで消える → `checkMarksStaleAfterEdit` `checkRecheckClearsFixed`
- 図を待つ間は「確かめています」、読み込めないときは「確かめられなかった項目」(問題に数えない) → `checkShowsWaitingForDiagram` `checkUncheckedWhenDiagramCannotLoad`
- パネルは帯の下・画面に収まる(1280px・800px)・閉じる → `checkPaneBelowToolbar` `checkPaneFitsNarrow` `checkPaneCloses`
- 既知の制限: 外部の URL・ゴミ箱のページは調べない。1つの表の式のエラーは30か所まで並べる(残りは件数)。連鎖したエラー(参照先のエラーが伝わったもの)も
  セルごとに出る。空の図・空の数式のブロックは問題にしない(文中の空の数式は出す)。

## ライセンス表記(v290。Issue #234)

- LICENSE は GPL v3 の全文で、配る場所の写し(editor-pwa/legal/LICENSE.txt)と同じ → `licenseIsGplV3FullText` `licenseCopyForDistributionIsIdentical`
- package.json・Cargo.toml の license が GPL-3.0-or-later → `licenseManifestsSayGplOrLater`
- README に「または それ以降」・著作権表示・無保証・LICENSE へのリンク・ソースの入手方法 → `licenseReadmeStatesOrLaterCopyrightWarrantySource`
- 本体のソースの先頭に SPDX の表記。同梱のライブラリには付けず、元のライセンスのまま → `licenseSpdxOnOwnSources` `licenseVendorCodeKeepsOwnLicense`
- ライセンスのファイルが、ブラウザ版の配り方(Service Worker の一覧・サーバー)とデスクトップ版(stage-frontend)の全部に入っている → `licenseFilesExist` `licenseInServiceWorkerList` `licenseInDesktopStage` `licenseServedToBrowser`
- 第三者の表記が、同梱の Mermaid の版と合っている・バンドルの部品(dompurify など)・Apache の全文・Rust の部品を持つ → `licenseNoticeMatchesBundledMermaid` `licenseNoticeListsBundledParts` `licenseDesktopNoticeListsRustParts`
- 同梱の Mermaid に elkjs(EPL-2.0。GPL v3 と組み合わせられない)が入っていない(npm の配布物を置き直すと赤)。第三者の表記は elkjs を載せず、取り除いたことを書く。作り直しのスクリプトの版が同梱の版と合う → `licenseBundledMermaidHasNoElkjs` `licenseNoticeSaysElkjsRemoved` `licenseMermaidBuildScriptMatchesBundle`
- ELK の並べ方(`layout: elk`・`elk.stress`・`flowchart-elk`)を指定した図も、エラーにならずふつうの並べ方(dagre)と同じ絵で描かれる → `mermaidElkLayoutRendersWithoutError` `mermaidElkLayoutFallsBackToDagre`
- アプリの中(File → ライセンス情報…)で要約と全文・第三者の表記を読める。画面に収まり、Esc で閉じる(1280px・800px) → `licenseInAppDialog1280` `licenseInAppDialog800`
- 保存HTMLの先頭の注釈に本体のライセンスの表記。Mermaid の表記は図のある文書だけ → `licenseSavedHtmlNoteStatesGpl` `licenseSavedHtmlNoteCreditsMermaidOnlyWithDiagram`
- 既知の制限: ELK の並べ方は使えない(v291 で elkjs を取り除いたため。dagre で描く)。emoji-data.js は出典が不明のため SPDX を付けていない。
  デスクトップ版(exe・Linux)の「ライセンス情報…」と同梱の確認は、この版では実機で確かめていない(ブラウザ版で確認。stage-frontend の出力は確認済み)。

## 外での書き換えの取り込み(v245)

- AI がファイルの本文を直接書き換える(段落・表のセル・足す・消す)→ 提案「ファイルの外の変更」として出る。本文は採用するまで変わらない
  → `watchImportsDirectEdits`
- 一部だけ採用して保存 → ファイルは採用した所だけ変わり、戻した所は元に戻る → `watchSaveKeepsOnlyAccepted`
- 自分の保存は取り込まない → `watchIgnoresOwnSave`
- AI が id 無しで足した提案はそのまま出る。もう1つ足しても前の提案は二重にならない → `watchImportsAppendedSuggestion`
- こちらで打った所を外でも書き換えた(本文の書き換え・前の値の無い提案の両方)→「古い」 → `watchConflictIsStale`
- 外で書き換わった直後に保存しても、書き換えを黙って消さない(取り込んで保存を止める) → `watchSaveDoesNotLoseExternalEdit`
- 読めないファイル(書いている途中)は何もしない。読めるようになったら取り込む → `watchSkipsUnreadableFile`
- 書式はそのままで語句だけの書き換えは語句ごと、書式の書き換えは段落ごと、種類の変わったブロックは足して元を消す → `watchFormattingAndTypeChanges`
- デスクトップ版(exe の橋渡しを真似る): 取り込み・保存・自分の保存は取り込まない → `watchDesktopImportsAndSaves`
- デスクトップ版の見張りは目印(更新時刻と大きさ)が変わったときだけ全文を読む・目印が取れない古い exe では毎回読む(v275。#199)
  → `watchDesktopReadsOnlyWhenChanged` `watchDesktopFallsBackWithoutStamp`
- 既知の制限: ページの増減・題名・ブロックの並べ替えは取り込まない。input で開いた・ダウンロードで保存した文書は見張れない。
  デスクトップ版は見るたびにファイル全体を読む(大きな文書では重くなりうる。実機の exe では確かめていない)

## 目次

- 目次ブロックを作れる
- 見出しが目次に表示される
- 目次項目をクリックすると対象見出しへフォーカスできる
- 見出しレベルに応じて目次がインデントされる
- 目次が控えめな背景と境界線で本文ブロックから区別できる

## 添付ファイルと保存

- PDF をその場で見る(v277。形式 0.8.19): 添付すると1ページ目の見本(幅 35%・上の帯なし・application/pdf の blob) → `pdfPreviewByDefault`。
  ビューアが枠の中に描く → `pdfViewerRendersInFrame`(PDF ビューアの無い環境では証拠だけ)。見本を押すと画面いっぱいに開き、Esc で閉じる → `pdfOpensLarge`。
  マウスを乗せると幅のバー → `pdfResizeOnHover`。つまみのメニューの「中で読む」(attachmentView: "read")→ `pdfReadInPlace`。中で読むの高さを表と同じ下の端のつまみで変える(viewHeight。
  ダブルクリックで 300px に戻す。保存HTMLにも出る) → `pdfReadHeightAdjustable`。「ファイルとして表示」と Undo
  → `pdfShowAsFileAndUndo`。保存HTMLでも見本・中で読む・ファイル・大きく開く・印刷の囲み → `pdfWorksInSavedHtml`。PDF を出せない環境では一言を出してファイルの
  カード(エディタ・保存HTML) → `pdfUnavailableShowsNote`。図になる・開くときの attachmentView の直し・幅の既定 → `pdfIsFigureAndSanitized`
  - 既知の制限: 上の帯・縮小版の列を消す指定(#toolbar=0&navpanes=0)は Chrome・Edge の PDF ビューアのもの。Firefox などでは帯が出ることがある。
    中で読むの枠の上では、文書ではなく PDF がスクロールする。大きく開いた PDF の中にフォーカスがあると Esc では閉じない(× で閉じる)。
- 動画の添付(v273。形式 0.8.16): その場で再生できる → `videoPlaysInEditor`。マウスを乗せると幅のバーが出て、ドラッグで幅が変わる(選ばなくてよい) → `videoResizeOnHover`。
  Download できる → `videoDownloads`。
  つまみのメニューの「ファイルとして表示」/「動画として表示」・保存に attachmentView・Undo → `videoShowAsFileToggle` `videoShowAsFileUndo`。
  保存した HTML をブラウザで開いても再生できる → `videoPlaysInSavedHtml`。再生できない動画は一言を出してファイルのカード(保存HTMLも同じ。
  文書の中身は動画のまま) → `videoUnplayableShowsNote`。画像も「ファイルとして表示」にできる・動画は図(題名を付けられる)
  → `videoImageAlsoShowAsFile`。開くときの attachmentView の直し → `videoViewSanitizedOnOpen`
  - 既知の制限: 再生できる形式はブラウザで決まる(Chrome・Edge では mp4(H.264・AV1)と webm。H.265・mov・avi・wmv などはファイルのカードに
    なる)。動画は文書の中に入るので、文書がその分(約1.3倍)大きくなる。全体の描き直しでは動画が読み直される(再生中なら止まる)

- 新しい版の Monolio で作られた文書(保存形式の版がアプリより新しい)を開くと、押すまで消えない注意が出る。同じ版・古い版では出ない。
  保存し直すと今の版で書く(v228)
  → `formatVersionCompareIsNumeric` `newerFormatWarns` `newerFormatWarningStays` `newerFormatWarningClosesOnClick` `resavedUsesAppFormat` `sameOrOlderFormatDoesNotWarn`

- Files欄または上部ツールバーの追加ボタンからファイルを添付できる
- 画像や一般ファイルを本文へドラッグ＆ドロップして、挿入線の位置へ添付できる
- クリップボード内の画像を貼り付けて添付できる
- 添付画像が縦横比を保った本文プレビューとして表示される
- 添付画像の端をドラッグして、縦横比を保ったまま表示幅を20%から100%まで変更できる
- ID に `"` や `<` を含む添付がある文書(細工されたファイル)を開いて保存し直しても、添付はそのまま開け、
  保存HTMLに属性の外へ出る文字は残らない(開いたときに ID を振り直す)
- ブロック・ページ・段組みの id に `"` `]` などを含む文書(細工されたファイル)を開いても、id は安全な形・重複なしに振り直され、
  参照が付け替わる(v159): ブロックを選んで消せる/同じ id だった2つを別々に消せる/グラフは振り直した表を読み続ける/
  段組みは並んだまま幅も変えられる(列の番号の細工も含む)/ページのリンクが辿れる/
  保存したファイルそのものに細工した id が残らない
  (`importedBlockIdsAreSafeAndUnique` `importedChartStillReadsRenamedTable` `importedColumnGroupIsSafeAndIntact`
  `importedColumnLayoutCanBeResized` `importedHostileBlockIsOperable` `importedDuplicateIdBlocksAreSeparate`
  `importedPageLinkFollowsRenamedPage` `savedFileHasNoHostileIds`)
- 本文・グラフ・図に `<script>`・`on*`・`javascript:` リンク・`<img onerror>`・`<iframe>`・`foreignObject` を仕込んだ文書(細工されたファイル)を
  開いても、何も実行されず(開く＝DOMParser で読むだけ・本文は描画時に無害化)、本文にも図にも危険な要素が残らない。無害化しても図そのものは残る
  (`openedHostileFileRunsNothing` `openedHostileFileIsClean` `openedHostileFileKeepsText`
  `savedHtmlHasNoScriptOrHandlers` `savedHtmlKeepsFigures` `openPathHadNoInjectedErrors`。`importSanitizeSuite`。HANDOVER §4.28)
- (v227)細工した文書を開いても: SVG の画像を新しいタブで開いて中のスクリプトがアプリ(保存HTMLならそのファイル)のオリジンで動かない
  (SVG は data: URL で見せる。PNG などは今までどおり見える)/行の種類から画面の枠のクラスを足せない/図表の参照を含む本文 HTML の画像を
  読みに行かない/字下げはマイナス・極端な値が 0〜20 に直り、保存HTMLで本文が消えない/画像の題名の `$` で保存HTMLが崩れない/
  グラフの SVG の塗りの `url(…)` が残らない
  (`hostileTypeAddsNoClasses` `figureRefHtmlNotLoadedLive` `importedIndentNormalized` `imageAttachmentsStillShown`
  `editorSvgImageCannotRunInAppOrigin` `savedHtmlKeepsBlocksAfterBadIndent` `savedImageCaptionDollarKeepsMarkup`
  `savedHtmlImagesShown` `savedSvgImageCannotRunInOrigin` `chartSvgDropsUrlPaint`。`importSanitizeSuite`)
- (v244)ブロックの `type`・`text` が文字列でないファイルを開いても、ほかのページへ移って描画が止まらない(段落・文字列に直る)/
  保存HTMLを `#%` 付きで開いてもページの切り替えが動く/開発用サーバーが `/%` で落ちず、隣の `editor-pwa-…` フォルダを読ませない
  (`brokenValuesPageRenders` `brokenValuesNormalized` `savedHtmlBadHashKeepsPaging` `devServerRejectsSiblingFolder`
  `devServerSurvivesBadPercent`。`importSanitizeSuite`)
- デスクトップ版(Tauri): `write_document`(ダイアログ無しの上書き)は、このセッションでダイアログから開いた/保存したパスだけを上書きできる
  (`src-tauri/src/main.rs` の `AllowedPaths`)。無害化がすり抜けても、任意の場所への書き込みにはつながらない。※デスクトップ版はこの環境でビルドできず自動テスト対象外
- デスクトップ版の保存は置き換え(一時ファイルに書いてから rename。途中で落ちても元のファイルが残る。v275。#200)
  → Rust の `cargo test`(`save_tests`: 置き換えて一時ファイルが残らない・失敗しても元を触らない・目印が変わる)
- Service Worker は正常な応答だけを控えに入れ、誤りの応答・オフラインでは控えを返す(v275。#202)
  → `swCachesOnlyOkResponses` `swKeepsGoodCopyOnServerError` `swServesCopyWhenOffline`
- デスクトップ版でリンクを開く(v270。#67): 細工したリンク(`http://…/?q=1,<PC のファイル>` など)で PC のファイルが動かない・カンマを含む URL が
  そのままブラウザへ届く → `open_url_keeps_commas_and_runs_no_local_file`(`src-tauri/src/main.rs`。ブラウザが開くので `cargo test -- --ignored`。Windows だけ)
- デスクトップ版で Linux のリンクを開く(v278): GIO が URL を1つの値のまま既定のブラウザへ渡し、ローカルのファイルを動かさない
  → `open_url_gives_the_whole_url_to_the_browser_and_runs_no_local_file`(`src-tauri/src/main.rs`。Linux だけ。代わりのブラウザを使うので毎回流せる)
- デスクトップ版の保存まわり(v281。実機で外から操作。Linux・Windows): 開く・上書き保存・名前を付けて保存(日本語とスペースの名前)・添付の保存・
  リンク先の文書・変更を捨てる確認・外での書き換え(Linux)。Linux で画面を出すと固まっていたのを直した → `src-tauri/linux-save-e2e.mjs`・
  `src-tauri/windows-save-e2e.mjs`(全テストには入らない。手順は HANDOVER §4.44)
- デスクトップ版の CSP(v214): 実機相当の CSP を被せても、アプリが起動し、グラフ・Mermaid・数式が描け、印刷でも CSP 違反が1件も出ない。
  印刷の枠には実行されるインラインスクリプトが無く、保存HTMLの目印(`#document-manifest`)と全ページが残る
  (`cspRendersChartMermaidMath` `cspPrintFrameHasNoExecutableScripts` `cspNoViolations`。`cspSuite`。HANDOVER §4.28)
  ※Tauri の IPC(保存・開く・添付・リンク)の CSP 下での動作は実機で確認済み(v214)。この環境ではビルド不可なので、CSP を変えたら実機で確認
- ブラウザ版の CSP(v217): `index.html` の meta で、exe の CSP から IPC だけ除いた CSP が効く。そのまま開いても、グラフ・Mermaid・数式・印刷で
  CSP 違反が出ず、差し込んだインラインスクリプトは実行されない。exe へ同梱するときは meta が外れる(exe の CSP は tauri.conf.json が正)。
  3か所(tauri.conf.json・index.html・cspSuite)の CSP がそろっている
  (`pwaIndexHasCspMeta` `pwaCspIsExeCspWithoutIpc` `stagedExeIndexHasNoCspMeta` `pwaCspRendersChartMermaidMath`
  `pwaCspPrintFrameHasNoExecutableScripts` `pwaCspNoViolations` `pwaCspBlocksInjectedInlineScript`
  `exeCspMatchesSuite` `exeCspAllowsTauriIpc`。`cspSuite`)
## 表

- `/table` コマンドで3行3列の表を作れる
- 表の中にカーソルがあるとき、画面の一番下の帯に操作ボタンが出る(v216。ユーザー選択)
  - 本文の上に浮かせない（浮かせる方式は直前の本文を隠してしまうという指摘があった）。上のツールバーにも出さない(狭い画面で文書がずれた)
  - 表の外へフォーカスが移ると操作ボタンは消える（`tableToolbarShownAtBottom` `tableToolbarHidesOutsideTable`）
  - 狭い画面でセルを押しても文書がずれず、トリプルクリックでそのセルの中身だけが選ばれる（`tableCellClickKeepsLayout` `tableCellTripleClickSelectsCell`）
- 式のポイントモード（Excel と同じ）
  - 式（`=` 始まり）を編集中に同じ表の別セルをクリックすると、フォーカスを移さず参照（`B2` など）がキャレット位置に入る
  - 参照が入るのは `=`・演算子・`(`・`,`・`:` の直後だけ。それ以外の位置のクリックは通常のセル移動
  - クリックで入れた直後の参照は、続けて別のセルをクリックすると置き換わる（手入力やセル移動でこのモードは終わる）
  - （`formulaClickInsertsReference` `formulaClickReplacesPointedReference` `formulaOperatorThenClickAppends` `formulaPointedComputes` `formulaNonPointClickMovesNormally` `plainCellClickStillMoves`）
- ポイントモードのドラッグで範囲参照（SUM 専用ではない一般規則）
  - 参照を挿入できる位置でセルをドラッグすると範囲参照（`A1:B3`）が入る。クリック=単一参照、ドラッグ=範囲は同一モード内の連続した挙動（別機能ではない）
  - ジェスチャ衝突は状態で解く: 「式編集中＋参照挿入可能位置」というアプリ状態での pointerdown（参照挿入の成立）だけがドラッグを範囲挿入にする。ドラッグ途中の推測分岐はしない
  - 範囲はドラッグ方向によらず 左上:右下 に正規化（右下→左上に引いても `A1:B2`）。結合セルを跨いでも格子座標のまま
  - ドラッグ中は参照テキストが live で更新され（`A1`→`A1:A2`→`A1:B2`…）、対象範囲がハイライトされる（離すと消える）
  - 連続するクリック／ドラッグは直前の参照（範囲含む）を置き換える
  - スカラー文脈に範囲を置いたときの評価エラーは評価系に任せる（挿入自体は拒まない）
  - 通常のセル範囲選択（式を編集していないときのドラッグ）・フィルハンドルのドラッグとは取り合いにならない
  - （`formulaRangeDragInsertsRange` `formulaRangeDragHighlights` `formulaRangeDragAvoidsCellSelection` `formulaRangeDragReplacesPrevious` `formulaRangeReverseDragNormalizes` `formulaRangeThenClickReplacesWithSingle` `formulaRangeAfterCommaAppends` `formulaRangeComputes` `formulaRangeAfterOperatorInserts` `formulaRangeNormalDragStillSelects` `fillHandleWinsOverPointMode`）
- 列・行まるごと参照（`A:A` / `A:C` / `2:2` / `2:4`。Excel と同じ）
  - 範囲が許される場所ならどこでも使える（SUM/MIN/MAX/AVERAGE 専用にしない）。スカラー文脈の評価エラーは評価系任せ
  - **格納は文字どおり**（P18「参照は意図を保存する」）: セルの text には `A:A` をそのまま持ち、どの層でも `A1:A10` への展開を書かない
  - **生きた参照**: 評価のたびに現在の表の形へ解決し、行・列の増減に自動で追従する（行を増やせば SUM の対象も増える）。全体参照の解決は「範囲の列挙」と「フィルタ」を分離してあり、ヘッダー除外はフィルタ側の1点にだけ置く
  - 行・列の挿入では参照ラベルも追随する（A 列の左に列を挿入 → `A:A` は `B:B`、範囲は `A:B`→`A:C`）。参照先の行・列そのものを削除すると `#REF`
  - 軸違いの削除には巻き込まれない（New-24）: `A:A` のある表で行0を削除しても式は `A:A` のまま再計算され、`2:2` のある表で列0を削除しても同様（remap は軸対応の rowRole/colRole で、全体参照の「代表行0/代表列0」は端点として扱わない）
  - （`wholeColRefSurvivesFirstRowDelete` `wholeRowRefShiftsOnFirstRowDelete` `wholeRowRefSurvivesFirstColumnDelete`）
  - **エラー語彙の使い分け（Excel に合わせて #REF を正式採用）**: `#REF`＝参照切れ（参照先の行・列の削除、フィルで表からはみ出した参照）/ `#MERGE`＝結合セルの別名混在（下記）/ `#ERR`＝それ以外（構文・型・0除算など）/ `#CYCLE`＝循環。式の中の `#REF` トークンは表示も `#REF`
  - 式セル自身が対象の列・行に入ると `#CYCLE`（Excel の循環参照と同じ。自身を除外する独自仕様にしない。ヘッダー文字列も「数値だけ集計」規則で自然に無視され、専用分岐を書かない）
  - フィルの相対シフト: 列参照は横方向だけ動く（右へ `A:A`→`B:B`、下では不変）。行参照は縦方向だけ動く（下へ `2:2`→`3:3`、右では不変）。左端からはみ出せば `#REF`
  - 式のポイントモード中に行・列選択ハンドルをクリックすると `A:A` / `2:2` が入る（Excel の列ヘッダクリックと同等。直前参照の置き換え規則も同じ）。式編集中でなければハンドルは従来どおり行・列の選択
  - （`wholeColumnRowSyntaxComputes` `wholeColumnRefFollowsRowInsert` `wholeRowRefFollowsColumnInsert` `wholeColRangeRemapsOnColumnInsert` `wholeRowRangeRemapsOnRowInsert` `wholeRefFollowsDeletes` `wholeRefSelfCycleDetected` `wholeRowRefDeletedRowBecomesRef` `wholeColumnRefDeletedColumnBecomesRef` `wholeColumnRefFillDownUnchanged` `wholeRowRefFillRightUnchanged` `wholeRowRefFillDownShifts` `wholeColumnRefFillRightShifts` `wholeColumnRefFillPastEdgeRef` `wholeRefHandleInsertsColumnRef` `wholeRefHandleInsertsRowRefReplacing` `wholeRefHandleStillSelectsOutsidePointMode`）
- ヘッダー行・ヘッダー列と全体参照の除外（Excel の構造化テーブル方式。ユーザー承認済み）
  - **全体参照（`A:A` `2:2` 等）だけが宣言済みヘッダーを除外**する。明示範囲（`A1:B3`）は従来どおり全セルを含む（意図的に含めたいときの逃げ道）
  - ヘッダー行は既存のヘッダー行トグル、ヘッダー列は新設のヘッダー列トグル（表ツールバー、対象は最左列）で宣言する。未宣言の表では除外しない（素の Excel の `A:A` と同じ）
  - 除外は「参照の書き換え」や「事前展開」ではなく、全体参照を現在の表形状へ解決する箇所の**フィルタ1点**にだけ置く（P18 整合）。トグル切替後の再計算で結果が追従する
  - **ヘッダーフラグは「位置」に付く**: 先頭に行・列を挿入したら、新しい行0/列0がヘッダーになり、全体参照の除外対象も新行0/列0へ移る（Excel のテーブルと同じ）
  - 見た目: ヘッダー行・列のセルは**背景トーン＋太字**で本文セルと一目で区別できる（点線下線=式セル / 破線枠=フィル・参照プレビュー / 塗り=セル選択、の既存マーカー語彙と取り違えない系統）。保存HTMLにも同じ意匠を焼き込む（行は `doc-table-header`、列はセル自身の `doc-th-col` クラス）。ラウンドトリップで両フラグが戻る
  - ヘッダー行（⬒）とヘッダー列（◧）のアイコンは「片側が塗られた四角」の同じ視覚言語で対称（ユーザー指示: ペア感が一目で分かること）。ツールチップも「ヘッダー行」「ヘッダー列」で対称
  - （`wholeRefIncludesAllWithoutHeader` `headerToggleRecomputesWholeRefs` `explicitRangeIncludesHeader` `headerColumnExcludedFromWholeRowRef` `headerColumnTogglesTh` `headerCellsVisuallyDistinct` `headerFlagSticksToPosition` `headerColumnRoundtrips` `exportedHeaderKeepsLook` `headerToggleIconsArePaired`）
- ヘッダー境界と結合の制約（ユーザー指示:「ヘッダーがどこまでかが崩れる」ため）
  - 宣言された軸ごとに「ヘッダー|本文」境界（行0|行1・列0|列1）をまたぐ結合を禁止。結合ボタンは境界をまたぐ選択で disabled になり、実行もされない（二重の守り）
  - 境界をまたがない結合（ヘッダー行内の横結合・本文内の結合）は従来どおり可能。行・列の両方を宣言した角セル（A1）も同じ2条件の合成だけで決まる（角の特別分岐を書かない）
  - またぐ結合が既にある表でヘッダーをONにすると自動で分解してからヘッダー化（Excelのテーブル化と同じ）。文字は本体セルに残り、通知（setStatus）が出て、Undo 1手で「分解+ヘッダー化」がまとめて戻る
  - またぎ状態を作る全経路を塞ぐ: 結合操作・トグルONに加え、**ヘッダー行/列そのものの削除**（本文の結合が新しい行0/列0へずり上がる経路）でも自動分解+通知。行・列の挿入はヘッダーが位置に付く規則と不変条件により、またぎを作らない（監査済み）
  - （`headerMergeCrossBoundaryRefused` `headerRowInternalMergeAllowed` `headerCornerMergeRefused` `headerToggleSplitsCrossingMerge` `headerToggleSplitUndoIsOneStep` `headerExclusionWorksAfterAutoSplit` `headerDeleteAutoSplitsSlidingMerge`）
- 表の列幅（ドラッグ+ダブルクリック自動調整。Excel/スプレッドシート風）
  - セルを選んでいる間、各列の右端に縦帯のセパレータ（`role=separator`、col-resize カーソル、段組みの column-resizer と同じ操作言語）が出る。ドラッグで**その列だけ**が変わる（隣は不変=表全体の幅が列幅の合計に変わる）
  - 最初のドラッグで全列の実測幅を `tableColumnWidths` に焼いてから対象列だけ変える（未設定の表は従来どおり width:100% の均等割り）。表の幅は合計の明示 px（width:auto は親幅で頭打ちになり列が圧縮される実測バグを踏むため）
  - ダブルクリックで最長セル内容にフィット（測定は off-DOM の測定用スパン、colSpan>1 のセルは対象外）。帯にフォーカスして ←→ キーでも ±16px
  - 最小幅 48px。幅変更1回= Undo 1手（履歴は最初の実変更の直前に1回。動かないクリックは履歴を積まない）
  - 競合しない: セル中央のドラッグは従来のセル範囲選択、式編集中のセパレータドラッグは幅変更（参照は入らない）。アクティブセルの右下角は**フィルハンドルが優先**（z-index。Excel と同じ）。境界が結合セルの内部を通る列にはセパレータを出さない（見えないデッドゾーンを作らない）
  - 列の挿入・削除で幅の配列が splice で追随。保存HTMLには colgroup+合計幅で焼き込み、manifest 経由のラウンドトリップで `tableColumnWidths` が戻る
  - （`colResizeDragWidensOnlyTarget` `colResizeUndoSingleStep` `colResizeMinWidth` `colResizeDoubleClickFits` `colResizeKeyboardAdjusts` `colResizeAvoidsOtherGestures` `colResizeKeepsWidthsAcrossColumnInsert` `colResizePersistsRoundtrip`）
- セル結合の新モデル（「結合は表示だけ、グループ=1つの論理値」。ユーザー承認仕様）
  - 結合しても内部の各セルは独立に存在し、全員が本体と同じ値・色を持つ（ミラー）。ミラーの共通出口は `tableRows` の正規化1点（全読み書きが通る）で、input・フィル・置換・remap のどの経路で本体が変わっても自動整合。保存 manifest のメンバーにも値が入る
  - どのメンバー座標（A1/A2/B1/B2）でも参照でき同じ値を返す。解除すると各セルに同じ値・色が残り、参照は壊れない（集計は見た目どおり各セルぶんになる）
  - 範囲参照・全体参照（`A:A`）・グラフの range は**グループを1回だけ**数える。列挙は `rectNumberValues` の共通1箇所（ヘッダー除外フィルタと同居）で、**本体が範囲外でもメンバーが触れていれば1回**（covered スキップ方式は取りこぼす）
  - 1つの式に同一グループの**異なる座標**を混ぜると `#MERGE`（検査はトークン化直後の1パスで単一セル参照のみ。範囲は列挙側が守るので `=A1+SUM(A1:B5)` は合法。`=A1+A1` の複数回使用も合法）。ツールチップは「式 — 説明」形式（実座標入り: 「A1 と A2 は同じ結合セルの別名です…」）、確定時に setStatus でも通知、保存HTMLにも同じ title を焼き込み
  - 結合を知るのは cellOriginInRows への正規化だけ（読む側の使用箇所: 範囲列挙の dedup / 循環検出の seen キー / 式単位の重複検査 / 従来からの rawTableCellText。構造操作系の既存呼び出しは別）。別名経由の自己参照も正規化された鍵で `#CYCLE`
  - ポイントモードは格子を見る: 結合セルのクリックは**クリック位置のメンバー座標**を挿入（左半分なら A1、右半分なら B1。幾何は colgroup 適用後の実レイアウトから算出）。矢印・Tab のナビゲーションは従来どおり「結合=1セル」
  - 旧文書（covered が空）は読み込みの正規化で本体値がメンバーへ複製されて移行。`parsePortableHtml` は値入り covered を落とさない（往復）。部分書き込み（フィルが結合の一部にだけ書く形）は従来どおり安全側で拒否。ヘッダー境界の結合禁止（P19）とは共存
  - （`mergedMemberAliasSharesValue` `mergedRangeCountsGroupOnce` `mergedMemberTouchCountsOnce` `mergedAliasMixShowsMergeError` `mergedSameAliasTwiceLegal` `mergedChartCountsGroupOnce` `mergedAliasCycleDetected` `mergeKeepsSingleValueAggregate` `mirrorOnEditReachesMembers` `mirrorOnReplaceReachesMembers` `mergedModelSavesMemberValues` `mirrorOnColorReachesMembers` `mirrorOnRemapReachesMembers` `unmergeKeepsValuesAndRefs` `mergedPointModeUsesGridCoordinate` `mergedRoundtripKeepsMemberValues` `legacyCoveredMigratesOnLoad`）
- 表セル編集の Esc キャンセル（Excel と同じ）
  - Esc は「セル編集セッションのキャンセル」: **編集開始時の値へ戻す**（数式に限らずセル編集全般）。開始値のキャプチャはセルの focus ハンドラ1点（focusTableCell 経由も同じ focus を通る）
  - キャンセル後は編集モードを抜けた扱いで、フォーカスはセルのまま。再計算・依存グラフも戻った値で整合（復元は既存の input 経路を通すのでミラー(結合)も自動整合＝結合セルのキャンセルで全メンバーが開始時の値に戻る）
  - ポイントモード中の Esc も「編集開始時の値へ戻す」で一貫（参照挿入・置き換えマーカー・ドラッグ・ハイライトを破棄）
  - **優先順位は「最も局所の状態が勝つ」**: セル内の Esc は onTableKeydown が消費して stopPropagation。グローバル Esc（検索バー・パレット等を閉じる document capture リスナー）は発生元がセルなら一歩引く。非編集時（セル外フォーカス）の Esc 挙動は従来のまま
  - Undo を汚さない: 履歴の外科手術はせず、復元は同一セルの coalesce 窓に合流（Esc 後の Undo は同値で無害、次の Undo で「編集開始前の直前操作」が戻る）。※この前提だった「セル連続入力の coalesce」自体が壊れていたのを **New-25** として発見・修正（beforeinput のバブルが別キーの saveHistory を挟み、打鍵ごとに履歴が分解されていた。onBlockBeforeInput に表ガード追加）
  - （`escCancelRestoresPlainCell` `escCancelRestoresFormulaCell` `escCancelRestoresMergedMembers` `escCancelDuringPointMode` `escCancelKeepsUndoClean` `escCancelScopedAgainstSearchBar`）
- セルの色
  - セル（または取っ手・ドラッグで選択した行・列・範囲）に、ツールバーの背景色・文字色ボタンで色を塗れる
  - 標準色スウォッチとカスタム色入力の両方が効く。塗ったあともセルの編集は続けられる
  - `Tx`（書式クリア）でそのセル（範囲）の色をまとめて外せる
  - 色はモデル（`cell.color` / `cell.background`）に入り、再描画・保存HTMLでも保たれる
  - セル編集中も色ボタンと Tx は有効（フォント・サイズ・B/I/S は無効のまま）
  - セルへの入力がブロックの本文（block.text）へ漏れない（漏れると再描画で表の上に文字が現れる）
  - （`cellBackgroundAndTextColorApply` `cellColorsSurviveRerender` `cellTypingDoesNotLeakIntoBlockText` `rowSelectionBackgroundColorsAllCells` `cellFormatResetClearsColors` `exportedCellKeepsColors`）
- 数式セルの見分け（計算値には点線の下線）
  - 式（`=` 始まり）のセルは、計算結果に淡い点線の下線が付く。手で入れた値には付かない
  - マウスを乗せると元の式がツールチップで見える。編集中（フォーカス中）は式そのものが見えるので下線は消える
  - 式⇄値の書き換えに追随する。保存した単一HTMLにも同じ印とツールチップが付く
  - （`formulaCellShowsDottedUnderline` `plainCellHasNoUnderline` `formulaUnderlineFollowsEdits` `exportedFormulaCellUnderlined`）
- 行・列の選択ハンドル（Notion と同じ）
  - アクティブなセルの「列の上」と「行の左」にだけ小さな取っ手が出る
  - 押すとその列・行がまるごとセル範囲として選択され、「セルを結合」などに使える
  - 別のセルへ移ると取っ手も付いてくる。表の外へ出ると消える
  - （`tableRangeHandlesAppearForActiveCell` `tableColumnHandleSelectsColumn` `tableRowHandleSelectsRow` `tableRangeHandlesFollowActiveCell` `tableRowSelectionCanMerge` `tableRangeHandlesHideOutsideTable`）
  - 本文の中に置くとボタンの記号がブロックの文字として数えられ、キャレットの端判定が狂う
- 行を上/下に挿入、行を削除できる
- 列を左/右に挿入、列を削除できる
- 最低1行1列は残す（それ以上は削除できない）
- 構造の変更は Undo・Redo で戻せる
- セルをドラッグして範囲を選べる（Shift+クリックでも範囲を広げられる）
  - 表のセル上のドラッグは、ブロックまたぎのテキスト選択を起動しない
    （起動すると入れ物へフォーカスが移り、操作対象のセルが分からなくなる）
- 選んだ範囲を1つのセルへ結合できる（縦・横どちらも）
  - 中身は失わず、空でない文字を繋げる
  - 覆われたセルは描画・保存の両方から省く
  - 範囲の端で結合が切れている場合は、その結合を含む矩形まで広げてから結合する
- 結合を解除して1マスずつに戻せる
- ヘッダー行を切り替えられる（1行目が `th` になる）
- 結合と行列数は保存HTMLへ `colspan` / `rowspan` として引き継がれる

## 表の数式

- `=` で始まるセルを式として計算する
- セルの指定は `A1` 形式、範囲は `A1:B3` 形式
- 四則演算（`+` `-` `*` `/`）、括弧、単項マイナスが使える
- 剰余 `%` が使える（`* /` と同じ強さ。0で割ると `#ERR`、符号は割られる側。`tableFormulaCasesMatch` ほか）
- `AVERAGE` が使える（数値の入っているセルだけで平均。対象が無ければ `#ERR`。`tableFormulaCasesMatch` ほか）
- 累乗 `^` が使える（Excel と同じ思想）
  - `*` `/` より強く効く（`=2*A1^2` は `2*(A1^2)`）
  - 左結合（`=2^3^2` は `(2^3)^2 = 64`）
  - 単項マイナスが累乗より先（`=-2^2` は `4`）。負の指数 `=2^-2` も可
  - （`tableFormulaCasesMatch`）
- 関数は `SUM` `MIN` `MAX` の3つ。範囲でも引数の並びでも渡せる
- 関数の引数には式も書ける（例: `=MAX(A1*2,B1*3)`）
- 参照先のセルを書き換えると、その場で計算し直す
- 編集中は式そのものを表示し、離れると計算結果を表示する（Excel と同じ）
- ゼロ除算・文法の誤り・未対応の関数は `#ERR`
- 自分自身や相互に参照し合う式は `#CYCLE`（無限に回らない）

## グラフ

- `/chart` コマンドでグラフブロックを作れる。書き方の見本が入っている
- 定義は matplotlib.pyplot に似せた「1行1コマンド」の形
  - `scatter(A1:A10, B1:B10)` 散布図
  - `plot(A1:A10, B1:B10)` 折れ線
  - `bar(A1:A10, B1:B10)` 棒
  - `hist(C1:C50, bins=12)` ヒストグラム
  - `title("...")` `xlabel("...")` `ylabel("...")` `grid(false)` `xlim(0,10)` `ylim(0,50)`
  - `label="..."` を付けると凡例に出る
  - `table(2)` で文書内の n 番目の表を指定できる（既定は上にある一番近い表）
- 値は表から読む。式のセルは計算結果を読む
- 表を書き換えるとグラフが追従して描き直される
- 絵は本文の外に置く（軸の文字がブロックの文字として数えられないように）
- 書き方の誤りは、その場で理由を出す（使えないコマンド・範囲がない・読めない行）
- 保存HTMLには、見えていた絵と定義をそのまま載せる
  - 書き出した文書では値が変わらないため、描き直しの仕組みは持たせない
- 外部ライブラリは使わずSVGを組み立てる（オフラインと単一HTML保存のため）

- 添付画像を左揃え・中央揃え・右揃えに切り替えられる
- 揃えのボタンは文字ではなく、ワープロで一般的な行揃えアイコン
  - 長い線と短い線を交互に並べた形で、短い線の位置が向きを示す
  - 読み上げ用のラベルは Align left / Align center / Align right
- ファイル名・容量・配置・Downloadは画像ブロックの選択中だけ表示される
- 別のブロックや画面の余白を選ぶと画像の情報と操作が非表示に戻る
- 添付画像をダブルクリックすると暗い背景の拡大プレビューが開く
- 拡大画像は縦横比を保ち、画面内に収まる最大サイズで中央表示される
- 拡大プレビューは閉じるボタン・`Escape`・画像外の背景クリックで閉じられる
- 拡大プレビューを閉じると、開く前の画像へフォーカスが戻る
- 画像幅と配置はUndo・Redo、保存HTML、開き直し後にも保持される
- 添付ファイルの名前、サイズ、MIME 情報が表示される
- エディタ上の添付ファイルをダウンロードできる
- 添付ブロックを削除すると未使用の添付データも削除され、Undoで復元できる
- `Ctrl+S` で `.html` ファイルを保存できる
- 保存HTMLに文書データが埋め込まれる
- 保存HTMLに添付ファイルデータが埋め込まれる
- 保存HTMLをブラウザで開いて閲覧できる
- 保存HTMLでも添付画像が表示される
- 保存HTMLから添付ファイルをダウンロードできる
- 添付ファイルのハッシュ検証ができる
- フォントファイルをサブセット化せず、ファイルまるごと埋め込める
- 埋め込んだフォントが編集中もフォント選択に現れ、実際の書体で表示される
- 保存HTMLの添付データが、元のフォントファイルとサイズもハッシュも一致する
- 保存HTMLを開き直すと、埋め込みフォントが再登録されて選べる状態に戻る
- 保存のたびに、本文で使っていない埋め込みフォントは削除される
- 「Attach Files」メニューの一覧で、埋め込みフォントの行の削除ボタンから消せる(v176)。そのフォントを使っていた文字は
  書体の指定も外して標準の書体へ戻る(保存HTMLにも残らない)。`Ctrl+Z` でフォントごと戻る
- 使っていないフォントの添付データも保存HTMLに残らない
- 削除されたフォントはフォント選択からも消える
- 本文で使っているフォントは保存後も残る
- 保存時に削除されたフォントは Undo で戻せる
- 保存HTMLにインラインコード用の `code.inline-code` 要素が含まれる
- 保存HTMLを開き直してもインラインコードの内容と見た目が保持される
- 散布図・折れ線に近似曲線を引ける(v177)。`trendline="linear"`(`True`)・`"poly2"`(二次)・`"log"`(対数)・`"exp"`(指数)。
  式・R² は `trendline_eq=True`・`trendline_r2=True` で枠の左上に出る。系列の色の破線で、X の端から端まで。自動の Y の範囲は曲線も含む。
  分類の軸の X は 1, 2, 3…。棒・対数の X ≤ 0・指数の Y ≤ 0・知らない種類は見える形のエラー。設定欄は種類の選択と式・R² のチェック
  (`chartTrendSuite`: `trendLinearEquationAndR2` `trendCurveEquations` `trendIncludedInAutoRange`
  `trendCategoryAxisUsesOneBasedX` `trendInvalidUsesShowErrors` `trendSvgSurvivesSanitize` `trendPaneWritesCode` ほか)

## Mermaid の図(v194。形式 0.8.5)

ユーザー「図は svg で」。設計は HANDOVER §4.27。テストは `mermaidSuite`。

| 確認すること | テスト項目 |
|---|---|
| `/mermaid` で入れると見本の流れ図が SVG で描かれ、コードが開いてそこにフォーカス。foreignObject なし、id は `pagelith-mermaid-` | `mermaidInsertedFromSlash` `mermaidRendersPureSvg` |
| `/図` でも入る | `mermaidInsertedFromJapaneseSlash` |
| 図の無い文書では Mermaid 本体を読み込まない(図を入れたとき・図のある文書を開いたときだけ) | `mermaidNotLoadedWithoutDiagram` `mermaidNotLoadedForDocumentWithoutDiagram` `mermaidLoadedOnDemand` |
| コードを書き換えると描き直す | `mermaidRerendersOnEdit` |
| 文法の誤りは図の下に赤で出る。コードは開いたまま、前の図は薄く残る。body に何も漏れない | `mermaidShowsSyntaxError` `mermaidErrorKeepsLastGoodSvg` `mermaidErrorLeaksNothing` |
| 保存は形式 0.8.5。保存HTMLに SVG と畳んだコード、Mermaid の script は無い。開き直してもコードと図が残る | `mermaidSavedAsFormat085` `mermaidSavedHtmlHasSvgAndCode` `mermaidSurvivesReopen` |
| 保存HTMLを Mermaid なしで開いても図が見え、印刷に出る(コードは刷らない) | `mermaidSavedHtmlShowsSvgWithoutMermaid` `mermaidPrints` |
| 細工した SVG(script・foreignObject・on〜・外を指す href/url・@import・図の外を選ぶ CSS・アプリと同じ id)は、開くとき・画面・保存で無害になる | `mermaidHostileSvgSanitizedOnOpen` `mermaidHostileSvgInertInEditor` `mermaidHostileSvgSanitizedOnSave` `mermaidHostileSavedHtmlInert` |
| (2026-10)同梱の Mermaid 自体が、文書のコードから仕込める攻撃を無害にする: 書体の指定(fontFamily・altFontFamily)・themeCSS・classDef・style からの CSS の入り込み(図の外へ効く規則・兄弟セレクタ)、設定のプロトタイプ汚染、securityLevel を緩める指定。無害な指定は効く(対照)。無害化を通した後も外へ効かない。判定の自己点検つき。Mermaid を上げたとき・設定を緩めたときに赤になる | `mermaidLibAttackProbeRan` `mermaidAttackDetectorWorks` `mermaidLibAppliesBenignDirective` `mermaidLibDropsFontFamilyInjection` `mermaidLibBlocksCssEscapes` `mermaidLibNoPrototypePollution` `mermaidLibStaysStrict` `mermaidAttackSvgSanitizedClean` |
| ロックしたページの図はコードを編集できず、描いても「中身が変わった」と戻されない | `mermaidLockedPageNotEditable` `mermaidRenderDoesNotTripLock` |
| 複製すると図がすぐ出る(控えを使う)。コピーの text/plain はコード | `mermaidDuplicateShowsDiagramAtOnce` `mermaidCopiesSourceAsPlainText` |
| 旧い形式(0.8.4)のファイルも開ける | `mermaidOldFormatOpens` |
| (v196)無害化で絵が欠けない: ジャーニーの区切りの名前が見える・アーキテクチャ図のアイコン(入れ子の svg)・根の id を含む id(特性要因図の矢印)・サンキー図の流れの塗り・ユースケース図の max-width | `mermaidKindsRenderWithoutErrors` `mermaidJourneySectionLabelVisible` `mermaidArchitectureKeepsIcons` `mermaidKeepsIdsWithRootInside` `mermaidSankeyLinksPainted` `mermaidKeepsMaxWidthBesideCssVariables` |
| (v196)入れ子の svg も on〜 を捨てる。根の style は max-width の数だけ。根の id を含まない id は捨てる | `mermaidNestedSvgSanitized` |
| 全種類(35種)の描画は機能見本の作り直し(`node sample/build-sample.mjs`。日本語版・英語版の両方)で図ごとに ok/誤りを出して確かめる | (見本スクリプトの出力) |

- 既知の制限: 文法の誤りのまま保存すると、保存HTMLには前に描けた図が載る(コードは誤りのまま)。古い版の Pagelith で 0.8.5 の
  ファイルを開くと、図のコードが段落の文字として見える(種類と SVG は残るので、新しい版で開き直せば図に戻る。古い版で編集して
  保存すると SVG は古いまま)。描くのはブラウザの中なので、文字の幅は開いた環境のフォントで決まる
- 既知の制限(v196): イベントモデリング(eventmodeling)は箱の文字を foreignObject(HTML)でしか描かないため、無害化で文字が消えて空の箱になる
  (データを書くと HTML の `<br>` が入り、SVG として読めず「図を描けませんでした」になる)。zenuml は同梱していない。サンキー図の名前は
  英数字だけ(Mermaid 12.1.0 の文法。日本語は引用符で囲んでも書けない)。ジャーニーの区切りの名前は、Mermaid の HTML の文字ではなく控えの SVG の文字で出る

## TeX数式

- `/math`(スラッシュ/＋メニューの「数式」)でブロック数式を作れる。ソース欄とプレビューが揃う
- 空の数式ブロックのプレースホルダは横書き1行で本文列の幅を使う(`.math-canvas` は
  `.chart-canvas` と同じく `grid-column: 2`。指定漏れで 40px ガター列に落ちる縦書きバグが実際に出た)
- **空の段落で `$$` と打ってもブロック数式には変わらない**(ただの文字として残る)。
  数式ブロックは「ブロックに付与した属性」であり自動変換しない、というユーザー方針。
  そのまま `$$abc$$` と閉じれば、行頭でも(前に文字がなくても)インライン数式になる
- TeX を打つとプレビューが MathML(ブラウザのネイティブ描画)で描かれる
  - 対応サブセット: `\frac` `^` `_` `\sqrt`(`\sqrt[n]{}` 含む)・ギリシャ文字・
    `\sum` `\prod` `\int`(上下限付き)・比較/演算記号・`\sin` 等の関数名(立体)・
    `\left(\right)` の自動サイズ括弧・`\begin{pmatrix}` 系の行列・`\text{}`・`\underbrace` `\overbrace`(v257。#137)
  - トップレベルの `\\` / `\newline` は行区切り(複数行は mtable・中央揃え)。
    行列の中の `\\` は従来どおり行列の行区切り(意味が違う点に注意)。
    末尾の `\\` は無視、連続 `\\` は空行。ソース中の物理改行(Enter)は入力できるが
    描画には影響しない(LaTeX と同じく無視。行は `\\` の数で決まる)
- 編集していない間はソースは1pxに畳まれ、描画結果だけが残る(display:none だと
  キーボードでフォーカスできないため畳むだけにする)。開閉は `.source-open` クラスで
  app.js が駆動する(:focus-within だとクリック時の静的選択モードで畳まれてしまう)
- ソーステキストのクリックは、クリックした文字位置にそのままキャレットが立つ
  (キャレットを乗っ取る処理は無い。普通のテキストブロックと同じ)
- 描画結果のクリックで編集へ戻る。エラー表示(ソースが見えている)ならクリックした
  文字位置へ、MathML 描画なら横位置の割合に対応する位置へキャレットが立つ
- 数式ブロックの Enter は改行(コードブロックと同じ)。Tab はタブ文字
- **変換できない TeX は壊さない**: ソースをそのまま(エラー色で)表示し、データは常に TeX ソースが正
- インライン数式・コードは**チップ方式**(v104 で作り直し。Obsidian のライブプレビュー型):
  - モデルも編集中のDOMも `あ$$abc$$え` という**素の文字列**。編集中の範囲には特殊構造が
    一切ない(ZWSPなし・隠しスパンなし・編集不可要素なし)
  - **キャレット(選択)が触れていない** well-formed な範囲だけを、contenteditable=false の
    ウィジェット1個(数式: `span.inline-math[data-tex]`+MathML、コード:
    `code.inline-code[data-code]`+整形表示)に見せ替える。切替は selectionchange 駆動の
    描画パスであってテキスト操作ではない
  - 閉じの `$$` を打っている間(触れている間)は素のテキストのまま。キャレットが離れた
    瞬間にウィジェット化される(専用の「変換処理」は存在しない)
  - 進入: 隣接位置からの ←→/Backspace/Delete がウィジェットを素テキストに見せ替え、
    キー本来の処理はブラウザ標準に任せる(←は1文字進んで閉じデリミタの内側、
    Backspace は閉じデリミタを普通に1文字削除=構文が壊れて素のテキストへ)。
    クリックでも進入できる(クリック位置の割合でキャレット位置が決まる)
  - 退出: キャレットが範囲から離れた瞬間にウィジェットへ戻る(ソースを再パース)
  - 素のテキスト状態では、先頭・末尾を含む全キャレット位置に1手1位置で立てて、
    どこでも文字を挿入できる。編集・IME・選択・Undo は普通の段落と同一のコードパス
  - **不変条件**: 編集状態の範囲は、同じ文字列を textContent 直代入したプレーン参照と
    全キャレット位置の字送りが一致する(一致する限り「キャレットが文字に被る」類の
    視覚バグは原理的に起きない)
  - **見せ替えは表示の状態遷移であって編集ではない**: ←→で出入りしただけでは
    Undo 履歴も dirty(未保存表示)も動かない(html キャッシュだけ静かに更新)。
    selectionchange は高頻度なので、範囲になり得る文字が無いブロックでは即座に帰る
- `Ctrl+Shift+E`(Notion と同キー)とツールバーの √x は、選択を `$$…$$` で括った
  素のテキストを挿入するだけ(キャレットは閉じの内側。外に出ると描画される)
- シリアライズはウィジェット→data-src(`$$tex$$` / バッククォート)、素テキスト→そのまま。
  検索の位置写像はウィジェットをソース文字数の不可分1単位として数える
- 検索は TeX ソースに当たる(モデル block.text に `$$tex$$` が入っているため)
- 保存HTMLには MathML を焼き込み(閲覧側にランタイム不要)、TeX ソースは data-tex と
  manifest に残る。開き直すと編集を継続できる(ラウンドトリップ)。旧構造
  (value/デリミタ入り)で保存されたデータも読める(互換ゲッター)
- 保存HTMLに編集UI(math-popover / math-canvas)の痕跡が混入しない
- 既知の制限: MathML の字形は OS の数学フォント依存(同梱フォント原則の例外。README 参照)
- 対応するテスト: `mathBlockCreatedBySlash` `mathPlaceholderIsHorizontal` `mathBlockRendersMathML`
  `mathBlockSourceCollapsesOnBlur` `emptyParagraphDollarsStayText`
  `inlineMathConvertsAtLineStart` `mathBlockEnterInsertsNewline`
  `mathBlockInvalidShowsSource` `inlineMathConvertsOnClosingDollars`
  `inlineMathArrowEntersSourceEnd` `inlineMathSourceEditsInPlace` `inlineMathExitRerenders`
  `inlineMathBackspaceDeletesDelimiter` `inlineMathBackspaceDeletesOneChar`
  `inlineMathCaretReachesBothEnds` `inlineCodeCanInsertAtStart` `inlineSourceMatchesPlainTextMetrics`
  `inlineMathBrokenDelimiterFallsBackToText` `inlineMathUnwrapUndoRestores`
  `inlineMathCtrlShiftEWrapsSelection` `inlineMathSelectionUndoRestores`
  `inlineMathToolbarInsertsNew` `searchFindsMathSource` `exportedMathRoundtrip`
  `inlineChipTransitionsKeepHistoryClean` `legacyInlineHtmlExportsMath`
  `mathBlockSourceClickPlacesCaret` `mathBlockCanvasClickEntersAtPosition`
  `mathLineBreakCommands` `mathBlockLineBreakRenders` `mathUnderOverBrace`

## バージョン表示

- 画面右下に「v1.0.0 · build 293」が小さく常時表示される(v の後ろ = アプリの版、build の後ろ = 内部の通し番号。HANDOVER §4.54)
- アプリの版の正は `document-format.js` の `APP_VERSION` ただ1つ(上げるのは公開のリリースのときだけ)。
  package.json・package-lock.json・Cargo.toml・Cargo.lock・tauri.conf.json は同じ値で、versionSuite が一致を見張る
- 通し番号の実体は `service-worker.js` の `CACHE` 文字列ただ1つで、app 側は起動時に
  稼働中のキャッシュ名(オフラインでも読める)か service-worker.js 自体から読む。
  SW の番号を上げれば表示も自動で揃う(数字がズレる事故を防ぐ)
- 保存HTML(Ctrl+S)には画面のバージョン表示は出ない。代わりに manifest の `formatVersion`(保存形式の版 `1.0`)と
  `generator`(`Monolio 1.0.0`)、`<meta name="generator">`、先頭の注釈に両方の版が入る
- 対応するテスト: versionSuite(`appVersionIsSemver`・`appVersionMatchesPackages`・`badgeShowsAppVersionAndBuild`・
  `savedHtmlHasBothVersions`・`formatVersionIs10`)、`versionBadgeMatchesServiceWorker`(mathSuite)、
  `exportedMathRoundtrip` 内で保存HTMLへの非混入を確認

## 表のフィルハンドル(オートフィル)

- アクティブセル(または範囲選択)の右下に、Excel と同じ小さな四角のハンドルが出る
  (`.block` 直下の絶対配置で、本文の文字数には影響しない)
- ハンドルを上下左右へドラッグすると、その方向のセルへ内容を展開する
  - ドラッグ中は適用先の範囲が破線でプレビューされる
  - フィル後はソース+適用先が選択され、ハンドルはその右下へ移る
- フィルの規則(優先順、Excel に合わせる):
  - 数式セルは相対参照を移動量ぶんシフト(`=A1+B1` を下へ → `=A2+B2`。`A1:B1` の範囲参照も同じ)。
    表の左上からはみ出す参照は `#REF` になる
  - レーン(縦フィルなら1列・横なら1行)が全て数値で2セル以上の等差 → 数列を継続(1,3 → 5,7)
  - 1セルの数値は値コピー(Excel の既定)
  - 「項目1」のような末尾数値は数値部分をインクリメント(0埋めは桁を保つ)
  - その他のテキストは値コピー(複数ソースは繰り返しパターン)
- セルの色(cell.color / cell.background)もソースからフィル先へ写る
- フィル1回 = Undo 1手。フィル後は数式の再計算と依存グラフの再描画が既存経路で走る
- ハンドル以外からのセル間ドラッグは、これまでどおり範囲選択(フィルと競合しない)
- 結合セルは安全側: ソースに結合が絡むとハンドルを出さず、適用先に結合が絡むフィルは何も起きない
- 対応するテスト: `tableFillHandleAppearsOnActiveCell` `tableAbsoluteRefFill`
  `tableFillFormulaShiftsRangeRefs` `tableFillContinuesArithmeticSeries`
  `tableFillTextSuffixIncrements` `tableFillCopiesPlainText` `tableFillUndoIsSingleStep`
  `tableFillCopiesSingleValueAcross` `tableFillCopiesCellColors`
  `tableFillDoesNotHijackCellDragSelection` `tableFillHandleHiddenOnMergedSelection`
  `tableFillSkipsMergedTarget` `tableFillLeftCopiesValue`

## グラフ設定GUI(右ペイン)

- **グラフを選ぶと、画面右に設定ペインが(算出値で)表示される**(v157。グラフ編集GUI 段1。出典はユーザー原文、細部はユーザー委任下の PdM 判断)
  - グラフの絵をクリックすると開き、系列と設定が見える。ブロックは選ばれ、**コード欄にはキャレットもフォーカスも入らない**
  - 絵は Tab で届き、Enter でも開く。コード欄へのフォーカス・ハンドルでの選択・矩形選択でグラフ1つだけ、でも開く
  - ペインの中を操作している間は開いたまま(入力はコードへ書き戻る)
  - 本文の別の場所のクリック(フォーカスの移らない余白も)・Esc・ページの切り替え・グラフの削除・Undo/Redo でグラフが消えた・
    ファイルを開き直した、で閉じる。別ページから戻っても勝手には開かない
  - 狭い画面では、ページ目次のオーバーレイとペインを同時に開かない(後から開いた方が勝つ)
  - (`chartCanvasClickOpensPane` `chartCanvasClickKeepsCaretOutOfCode` `chartPaneStaysOpenWhileEditingIt` `chartPaneClosesOnOutsideClick`
    `chartPaneClosesOnEscape` `chartCanvasEnterOpensPane` `chartPaneClosesOnNonFocusClick` `chartPaneShowsWhileEditingChart`
    `chartGripSelectionOpensPane` `chartMarqueeSelectionOpensPane` `chartPaneClosesOnPageSwitch` `chartPaneClosesOnDelete`
    `chartPaneClosesWhenHistoryRemovesChart` `chartPaneClosesWhenUndoRemovesChart` `chartPaneClosesOnReopen`
    `chartPaneAndPageTreeNeverBothOpenOnNarrow` `pageTreeOverlayClosesChartPaneByItself`)
- **データの表を選べる**(v158。グラフ編集GUI 段2): 「直上の表(自動)」+ページの表の一覧(表 n・直前の見出し・先頭行で見分ける)
  - 表を選ぶとコードに `table(id="…")`(表そのものを指す)が書かれ、別の表を選ぶとその行が書き換わる。自動に戻すと行が消える
  - GUI で選んだ表は、上に表を足しても同じ表を読む。手書きの `table(2)` は従来どおり位置で読む
  - 表を削除すると「データの表が見つかりません」と出て、ペインでは「見つからない表」を選んだ状態で見える(選び直せる)。Undo で戻る
  - 存在しない n(手書きの table(n))を指しているときは「見つからない表 (n)」を選んだ状態で見える
  - GUI では編集できない設定(xlim・知らないコマンド・知らないオプションなど)があると「GUI では編集できない設定がコードに N 行あります」と出る。
    コメントは数えない
- **広い画面では本文の右にペインの幅を空け、グラフとペインが重ならない**(v158。両方が収まる幅のときだけ)
  - 開いた瞬間に本文が縮んでも、クリックしたグラフは画面上の同じ位置に残る。グラフの絵は縮んだ列の幅で描かれる
  - 閉じるクリックで本文が広がっても、クリックした段落にキャレットが入る。押した瞬間には本文を動かさない(チェックボックスのクリックが届く)
  - 列幅を決めた表が縮んだ列からはみ出すなら空けない。両方が収まらない幅では従来どおり重ねる
- **貼り付けるブロックの id は、文書に無ければそのまま・あれば振り直す**(v158。移動では同一性を保ち、複製では新しくする)
  - 表とグラフを一緒にコピーして貼ると、貼った側のグラフは貼った側の表を読む
  - 表だけを切り取って同じページに貼ると id はそのままで、グラフは読み続ける。同じ切り取りを2回貼ると2回目は別の id
  - グラフだけを別ページへ貼ると「データの表が見つかりません」。外から来た安全でない id は振り直す
  - (`chartPaneReservesSpaceOnWideScreen` `chartPaneKeepsClickedChartInPlace` `chartSvgFitsReservedColumn`
    `chartPaneTableOptionsAreDistinguishable` `chartPaneTablePickWritesLine` `chartPaneTableAutoRemovesLine`
    `chartPaneNotesUneditableLines` `chartTablePickedByIdSurvivesInsertAbove` `handwrittenTablePositionStillReadsByPosition`
    `chartTableDeletedShowsNotFound` `chartPaneShowsMissingTable` `chartPaneCountsUneditableLinesButNotComments`
    `chartPaneCloseKeepsLayoutUntilRelease` `chartPaneCloseClickLandsInClickedBlock` `chartAndTableCopiedTogetherReadPastedTable`
    `cutTablePastedKeepsIdAndChartReadsIt` `sameCutPastedTwiceGetsNewIdSecondTime` `chartPastedToOtherPageShowsTableNotFound`
    `chartPaneSkipsReserveWhenSizedTableWouldOverflow` `pastedBlockIdIsKeptOnlyWhenSafe` `chartPaneOverlaysWhenBothDoNotFit`)
- **系列の範囲を表からドラッグで選べる**(v160。グラフ編集GUI 段3): X・Y の欄の横の「表から選ぶ」(▦)
  - 読んでいる表に枠が付き、いまの範囲が強調される。ドラッグ中は欄が live で変わり、離すとコードの行が書き換わる。その間ペインは閉じない
  - Undo 1手で戻る。Esc で取り消すとコードは変わらず、欄も元に戻る。Enter でも決まる。クリックは1セル、Shift+クリックでいまの範囲から伸ばす
  - 見出し: ヘッダー行を宣言した表では、X も Y も見出しを含めて選ぶとどちらも2行目から、ラベルは Y の見出し
  - 宣言していない表では、Y の1行目が文字ならそれをラベルにして2行目から。X が見出しの行から始まっていれば X もそろう。X 側は
    文字かどうかで推測しない(分類の軸の「1月」)。手で付けたラベルは上書きしない
  - 読んでいない表は薄くなり、押しても選ばない(「このグラフが読んでいる表(表 n)の上で選んでください」)。表の外を押すと取り消して
    ペインが閉じる。読む表が無いグラフでは押せない
  - 長い表で下端の近くに止めると、自動でスクロールしながら範囲が伸びる
  - 選んでいる途中でページを切り替えても、表の印はすべて消え、表のセルは普通に編集できる
  - (`chartRangePickDragWritesFieldAndCode` `chartRangePickKeepsPaneOpen` `chartRangePickUndoesInOneStep` `chartRangePickEscapeCancels`
    `chartRangePickHeaderRowBecomesLabel` `chartRangePickDeclaredHeaderDropsBothAndLabels` `chartRangePickClickShiftClickAndEnter`
    `chartRangePickIgnoresOtherTables` `chartRangePickOutsideClickCancelsAndCloses` `chartRangePickDisabledWithoutTable`
    `chartRangePickEdgeAutoScroll` `chartRangePickEndsCleanlyAndCellsStayEditable` `chartRangePickNumericFirstRowIsNotHeader`
    `chartRangePickOrderDoesNotMatter` `chartRangePickAlignsWithManualLabel`)
  - ラベルを手で付けていても、Y→X の順で X は見出しの次の行からにそろう(根拠は見出しの判定。v162)
  - 見出しの判定は表の数の判定と同じ: 1行目が「1,000」なら見出しにしない(v161)
  - 選ぶ順で結果が変わらない: 宣言のない表で X→Y でも Y→X でも、X と Y はどちらも見出しの次の行から(v161)
- **グラフのコードは既定で畳む**(v161。グラフ編集GUI 段4): コードの上の帯に「コードを表示/コードを隠す」とコードの行数
  - 表示→隠すで開閉する。開いたコードにフォーカスするとペインが開く(従来どおり)。隠すとフォーカスは帯のボタンへ
  - 畳んだまま GUI で編集するとコードが変わり、Undo が効く(Undo でコードは開かない)
  - エラーや GUI では編集できない行があると、畳んでいても帯に「エラー N 件」「GUI では編集できない行 N」が出る
  - コード欄そのものにフォーカスが入ると開く。開閉は文書に保存しない。保存HTMLのコードは閉じた <details>
  - 開いて Undo しても開閉は戻らない。複製したグラフは畳んだ状態。開き直すと畳んだ状態
  - 矢印キーで畳んだグラフへ入ると、コードではなくグラフを選ぶ(打っても隠れたコードに文字が入らない)。絵の上の矢印キーで次へ移れる
  - 畳んだコードの中の語を検索すると、そのグラフのコードが開いて一致が見える
  - 新しく入れたグラフは畳んだまま始まり、ペインの最初の欄にフォーカスが入る
  - (`chartCodeCollapsedByDefault` `chartCodeShowHideToggles` `chartCollapsedCodeEditsThroughGuiAndUndoes`
    `chartCollapsedCodeShowsErrorsAndForeignLines` `chartCodeOpensWhenFocusedByKeyboard` `chartSourceStateIsNotSavedAndExportCollapses`
    `chartSourceOpenStateIsNotUndone` `chartPastedCopyStartsCollapsed` `chartArrowKeysSelectCollapsedChartWithoutTyping`
    `chartSearchInCollapsedCodeOpensIt` `newChartStartsCollapsedWithFocusInPane` `chartSourceCollapsesAfterReopen`
    `exportedChartSourceKeepsCodeStyle`)
  - 保存HTMLでコードを開くと、枠・背景が付き、長い行は横スクロールになる(v162)
- **分類の軸・系列の色・凡例・目盛線**(v163。グラフ編集GUI 段5a)
  - 縦棒・折れ線で X が文字(1月・2月…)なら分類の軸になり、目盛に文字が出る。縦棒が2つなら枠の中で横に並ぶ
  - 散布図の X が文字なら「散布図の X は数で指定してください」のエラーが見える(以前は黙って何も描かなかった)
  - Y の途中が空欄でも、後ろの点はずれない(その点だけ抜け、折れ線はそこで切れる)。分類は2系列で並びが違っても和集合の順
  - X が「1,000」のような数だけなら数の軸のまま。長い分類名は「…」で縮める
  - color="C3"・"tab:red"・"#rrggbb" で系列の色が変わる。CSS の名前(red)などはエラーにして既定の色。色を指定しない系列は自分の
    既定の色のまま。ペインの色の見本(C0〜C9 を書く)・自由入力の欄で書き換わり、空にすると自動
  - エディタが描いたグラフの SVG は、保存HTMLの無害化を通しても変わらない(許可リストと描画の語彙が一致)
  - 凡例: 既定は系列が2つ以上でラベルがあれば右に。legend(False) で出さない。legend(loc="bottom") などで位置。名前の無い系列は「系列 n」。
    ペインの「凡例」で書き換わる(自動を選ぶと行が消える)
  - 目盛線: 既定は横だけ。grid("x")・grid("both")・grid(False)。小文字の grid(false) も読む。ペインの「目盛線」で書き換わる
  - grid と legend は温存行として数えない。保存HTMLを直接開いても、開き直しても、分類の目盛・色・凡例が同じに描かれる
  - (`chartCategoryAxisBarTicks` `chartCategoryAxisLineTicks` `chartScatterTextXShowsError` `chartSeriesColorApplied`
    `chartLegendDefaultPlacementAndHide` `chartLegendTopShowsSeriesName` `chartGridFourKinds` `chartGridAndLegendAreNotForeign`
    `chartPaneGridSelectWritesLine` `chartPaneLegendSelectWritesLine` `chartPaneColorWritesLine` `chartStyleSurvivesSaveAndExport`
    `chartColorGrammarAndDefaults` `chartBlankYDoesNotShiftPoints` `chartCategoryUnionOrder` `chartCommaNumbersStayNumericAxis`
    `chartLongCategoryNamesAreShortened` `chartSvgSanitizeIsIdentity` `chartNumericBarsSitAtXValues` `chartYAxisHasHeadroom`
    `chartLegendLongNameIsShortened`)
  - 数の X の縦棒は X の値の位置に立つ(Y の途中が空欄でも後ろの棒は自分の目盛りの位置。端の棒ははみ出さない)(v164)
  - 自動の Y 軸は、最大値がちょうど目盛りに乗るとき1目盛り上まで取る(ylim を書けばそれに従う)。凡例の長い名前は「…」で縮める(v164)
- [ ] 軸の最小・最大とデータラベル(v165。グラフ編集GUI 段5b)
  - xlim(下, 上)・ylim(下, 上)。片側だけ(ylim(bottom=0)・ylim(top=50)・ylim(None, 100)・ylim(0, ))は反対側が自動(余白も付く)
  - ylim(5) は下限 5(ylim(bottom=5) と同じに描く)。xlim(2) は左端 2(v166。matplotlib と同じ)
  - 範囲をデータより狭くしても(ylim(50, 100))、棒・線・点は枠の中だけ。目盛りは範囲の中だけ
  - 読めない形・下≥上・分類の軸の xlim は見える形のエラー。読めない側だけ自動(ylim(a, 3) の上は 3)。分類の軸では X の欄が無効で理由が出る
  - ペインの範囲の欄: 片側だけなら ylim(bottom=0) の形で書く。読めない ylim の行は温存行(欄は空)。欄に打つと、その行を置き換える
  - 範囲の欄に「-」→「-5」、「0.」→「0.5」と1文字ずつ打っても、ylim の行は1つでエラーなし(打ちかけの間は欄に印だけ)(v166)
  - 同じ名前の行が2つあれば、ペインは後の行を映して書き換える(描画と同じ。題名も)(v166)
  - values=True: 縦棒は上(負は下)、折れ線は点の上。文字は表の表示(1,200)。ペインの「値を表示」で書き換わる。重なりは間引かない
  - 上端の値のラベルは枠からはみ出さない: 縦棒は棒の中に白い文字、折れ線は点の下
  - グラフを選んだまま、パネルの欄で Backspace / Delete / ↑ / Enter / Tab を押してもグラフは消えない・動かない(v165 で直した不具合)
  - 保存HTMLを直接開いても同じに描かれる(ラベルの大きさ・色はクラス .chart-value / .chart-value-inside。属性の font-size は無い)(v166)
  - (`chartYlimBothSidesClips` `chartYlimOneSideAuto` `chartXlimClipsPoints` `chartBadLimitsShowErrors` `chartCategoryXlimShowsError`
    `chartBarValueLabelsAboveAndBelow` `chartLineValueLabelsAbovePoints` `chartPaneXlimDisabledOnCategoryAxis`
    `chartPaneLimitFieldsWriteLines` `chartPaneFieldKeysKeepChart` `chartPaneValuesCheckboxWritesOption`
    `chartYlimNamedOneSide` `chartNarrowYlimKeepsBarsInFrame` `chartValueLabelsStayInFrame` `chartPaneUnreadableLimitStaysForeign`
    `chartTicksStayInsideOddLimits` `chartPaneLimitPartialTypingOneLine` `chartPaneLimitWritesLastSameNameLine` `chartPaneLimitReplacesUnreadableLine`
    `chartSingleArgLimitIsLowerBound`
    `chartAxisSvgSanitizeIsIdentity` `chartAxisSurvivesExport`)
- [ ] 横棒 barh(v167。グラフ編集GUI 段5c)
  - 分類は縦の軸に表の順で上から。数の位置は値の位置を中心に(下から上へ)。複数系列は縦に並ぶ(先の系列が上)。負の値は 0 から左へ
  - xlim は値の軸(横)、ylim は位置の軸(縦)。分類の軸で ylim はエラー。範囲の外は枠で切る
  - データラベルは棒の右(負は左)。はみ出すときは棒の中に白い文字
  - 目盛線の既定は縦の線(値の目盛りの位置)。grid("y") で横の線
  - ほかの種類と混ぜたら見える形のエラー(最初の系列の向きに揃える)。長い分類の名前は左を空けて出す。左の凡例と重ならない
  - invert_yaxis() で縦の向きが逆(横棒の分類は下から・縦棒は値が下へ増えラベルも下)。引数つきはエラー。温存行に数えない
  - 横棒でも範囲選択: 値(2番目)を見出しごと選ぶとラベルになり、位置(1番目)の始まりがそろう
  - ペイン: 種類に barh。範囲の欄は「X(値)」「Y(位置)」、分類の軸では Y の欄が無効。目盛線は「縦(既定)」。系列の追加は横棒
  - 自動の値の軸の上端は目盛りの値(最大値 210・間隔 50 なら 250。いちばん高い棒は枠の上端に付かず、ラベルは棒の外)(v167 で直した不具合)
  - 保存HTMLを直接開いても同じに描かれる(描いた SVG と同じ)
  - (`chartBarhCategoriesTopDown` `chartBarhNumericPositions` `chartBarhMultiSeriesStacksVertically` `chartBarhNegativeGoesLeft`
    `chartBarhValueLabels` `chartBarhLimitsMeaning` `chartBarhCategoryYlimError` `chartBarhMixShowsError` `chartBarhGridDefault`
    `chartBarhLongCategoryNamesFit` `chartPaneBarhLimitsAndKind` `chartPaneBarhWritesCode` `chartPaneBarhKindSwitch`
    `chartBarhLeftLegendDoesNotOverlap` `chartBarhInvertYaxis` `chartInvertYaxisOnColumns` `chartPaneInvertYaxisIsNotForeign`
    `chartRangePickBarhHeaderBecomesLabel` `chartAutoAxisEndsOnTick` `chartBarhSvgSanitizeIsIdentity` `chartBarhSurvivesExport`)
- [ ] 円グラフ pie(v168。グラフ編集GUI 段5d)
  - pie(分類, 値)。pie(値, labels=分類)(matplotlib の形)も同じに描く。12時から時計回り、扇形は分類ごとの既定の配色
  - values=True は値、autopct=True は整数の %、autopct="%1.1f%%" は小数1桁。両方なら「1,200(22%)」
  - 負の値はエラー(その扇形は描かない)。0 は扇形なし(凡例には出る)。全部 0 はエラー。1つだけなら円全体
  - ほかの種類と混ぜたらエラー。円は1系列だけ。color= はエラー。凡例は既定で分類の名前、legend(False) で消える
  - xlim・ylim・grid・xlabel・ylabel・invert_yaxis は書いてあっても使わない(エラーにも温存行にもしない)
  - ペイン: 種類に pie。円のときは軸まわりの欄・色・ラベル・系列の追加が隠れ、「割合を表示」が出る。種類を切り替えるとペインが追随する
  - 無害化: 円の SVG に対して恒等。path の d に語彙の外の文字があれば path ごと落ちる。保存HTMLを直接開いても同じに描かれる
  - 向きは最初の系列の行で決まる(書きかけの barh() でも)。向きの違う系列の分類は軸に入らない
  - 半分を越える扇は中点で2本の弧(large-arc は常に 0)。ほぼ 100% の扇([1, 1000000])も消えずに描かれる(v169)
  - 無害化: d は path にだけ許す(rect・line などに付けた d は落ちる)(v169)
  - startangle=0 は3時から、counterclock=True は反時計回り。同じ名前の分類は合計しない
  - 円に残った軸まわりの設定は、帯に「円では効かない行 N」。labels= の行はペインで温存行。種類の選択肢は重複なし・日本語
  - (`chartPieSlicesStartAtTopClockwise` `chartPieMatplotlibFormSame` `chartPieLabelsValuesAndPercent` `chartPieAutopctFormat`
    `chartPieNegativeAndZero` `chartPieMixShowsError` `chartPieOneSeriesOnly` `chartPieColorIsError` `chartPieIgnoresAxisSettings`
    `chartPieLegend` `chartPieFullCircle` `chartOrientationFromFirstSeriesLine` `chartDroppedSeriesAddNoCategories`
    `chartPanePieHidesAxisFields` `chartPanePieWritesCode` `chartPieSvgSanitizeIsIdentity` `chartSanitizeDropsBadPathData` `chartPieSurvivesExport`
    `chartPieLargeArcFlag` `chartPieNearlyFullSliceIsDrawn` `chartSanitizeDropsDOutsidePath` `chartPieStartAngleAndDirection` `chartPieDuplicateNamesNotMerged` `chartPanePieLabelsFormIsForeign` `chartPaneKindChoicesAreUnique`)
- [ ] グラフ編集の区切りの片付け(v170)
  - 見出しのある表の下にグラフを作ると、見本は表から(範囲はデータの行だけ・A 列が文字なら縦棒・ラベルと軸の名前は見出し)でエラーが無い
  - 見出しを宣言した表・宣言の無い見出しの表・すべて数の表のどれでも、見本はデータの行だけでエラーが無い
  - 「系列を追加」は X は前の系列と同じ、値はまだ使われていない最初の列(無ければ最後の列)、ラベルはその列の見出し
  - ペインの言葉は日本語(グラフの設定・＋ 系列を追加・題名・X 軸の名前・Y 軸の名前・系列を削除)
  - 円全体(描く扇が1つ)は中心を通らない(半径の線が出ない)
  - (`chartSampleFromHeaderTable` `chartAddSeriesFromTable` `chartPaneTextsAreJapanese`。既存の chartPaneSuite は表から作る見本に合わせて書き換えた)
- [ ] アプリ名 Monolio(v222。旧名 Pagelith は v171〜v221)
  - 画面の題名・PWA の manifest(name / short_name / description)・デスクトップ版の productName とウィンドウの題名・確認ダイアログの題名・package.json の name・Cargo のパッケージ名と実行ファイルの名前・開けなかったときの知らせが Monolio
  - 保存ファイルの形式名(SingleHtmlTechnicalDocument)・Tauri の identifier(com.doceditor.desktop)・SW のキャッシュ名の接頭辞(doc-editor-pwa-)・Mermaid の図の id の接頭辞(pagelith-mermaid-)・localStorage のキー(pagelith-…)は変わらない
  - (`appNameIsMonolio` `appRenameKeepsInternalIds`)
- **既知の制限**: 列幅を決めた表が本文の列よりはみ出すときは、グラフのペインが重なる(本文の右を空けない。表を横スクロールの
  入れ物に入れる形は作っていない。列幅・フィルのつまみの位置合わせを壊すため。v158)
- GUI は「グラフ生成コードを書き換えるボタン」で、コード(block.text)が唯一の真実
  - GUI 操作は必ず該当するコード行の書き換え・挿入・削除として現れ、
    既存の parseChartSpec → buildChart → renderChartSvg の経路で描き直される
  - コード欄はこれまでどおり残り、手で編集できる
- ペインは #blocks の外にあり、グラフ本文の textContent を汚さない
  (.block-content に装飾要素を入れると壊れる罠のガード)
- 系列の一覧(種類・Xレンジ・Yレンジ・label・hist の bins)と追加・削除、
  全体設定(title / xlabel / ylabel)を操作できる
  - 種類が hist のときは Y の代わりに bins を編集する
  - 空にした title / xlabel / ylabel はその行ごと消える
- コードを手で編集すると GUI に反映される。パースできない行があっても GUI は壊れず、
  解釈できた範囲だけを表示する
- コメント行・未知のコマンド行・未知のオプションは GUI 操作後も原文のまま温存される
- GUI のタイプ入力は本文の入力と同じ規則で履歴にまとまり、Undo で1手ずつ戻る
- 保存HTMLにペインの痕跡(chart-pane)が混入しない
- モバイル幅では下側のシートになり、画面からはみ出さず横スクロールも生まない
- 対応するテスト: `chartPaneShowsWhileEditingChart` `chartPaneStaysOutsideDocument`
  `chartPaneReflectsCode` `chartPaneTitleEditsCodeOnly` `chartPaneSeriesRangeEditsCode`
  `chartPaneKindSwitchRewritesLine` `chartPaneAddSeriesInsertsLine`
  `chartPaneRemoveSeriesDeletesLine` `chartPanePreservesHandwrittenLines`
  `chartPaneEditsUndoInOneStep` `exportedHtmlHasNoChartPane` `chartPaneFitsMobileViewport`

## PWA

- ローカルサーバーから起動できる
- Service Worker が登録される
- アプリの基本画面が表示される

## デスクトップ版(exe)

- exe を起動するとエディタ画面が表示される
- `Ctrl+S` でネイティブの保存ダイアログが開き、選んだ場所へ単一HTMLを保存できる
- 2回目以降の `Ctrl+S` は同じファイルへ上書き保存される
- New document のあとは、次の `Ctrl+S` で再び保存先を選び直せる
- ブラウザ版の保存挙動はデスクトップ版の変更に影響されない
- File > Open でネイティブのファイル選択ダイアログが開き、単一HTMLを読み込める
- 開いたファイルが保存先として記憶され、次の `Ctrl+S` で同じファイルへ上書きされる
- 未保存の変更があるときの確認は、ネイティブのメッセージダイアログで表示される

## テスト無しで入れた変更(速いモードの負債)

速いモードは新規テストを書かない。**既存の防衛線は効くが、新しい防衛線は増えない**
(既存機能の回帰は PdM の松ランで捕まる/そのとき入れた挙動は、将来壊れても気づけない)。
どこが守られていないかが分からなくならないよう、1行ずつ残す。

- v153: 本文のページブロック(ページへのリンク)の見た目(太字・リンクの青・濃い輪郭のアイコン・ホバーで下線)。絵文字 📄 を
  SVG(document-format.js の `PAGE_LINK_ICON_SVG`)に替えたので、エディタと保存HTML(2ページ以上のときだけ)の markup も変わった。新規テスト無し

## 既知の方針

- **絞り込みで隠した行も、グラフに描き、式の計算に入れる**(v253。Issue #109。ユーザー決定「隠しているだけなのに結果に影響するのは不適切。削除と非表示はまったく別のもの」。Excel の既定とは違う) → `filteredRowsStillInChartAndFormulas`
- Markdown風ショートカットはブロック変換とインラインコード変換を扱う
- インラインコードのバッククォートはデータとして保持し、編集中だけ表示する
- インラインコードはバッククォートを1文字ずつ削除してMarkdownソースへ戻せるようにする
- 保存形式は単一HTMLを中心にする
- ブロックDOMを作り直している最中に届く `blur` では、文書モデルへ同期しない（変換前のテキストへ巻き戻るため）
- ブロックが空かどうかの判定は、押した瞬間の表示内容を正とする（モデルがずれてもキー操作を死なせない）
- テーブルのセルなど入れ子の編集領域から上がってきたキーで、ブロック自体を操作しない

## コード全体のレビューの直し(v279。#198・#204・#205・#206)
- 表を読むたびに作り直さない・手元の rows に書いた値が消えない・ミラーと古い文書の移行は前と同じ(#198)
  → `tableRowsReadKeepsIdentity` `tableRowsHeldReferenceSurvivesEditing` `tableRowsMirrorFollowsOrigin` `tableRowsMirrorMigrated` `tableRowsOrphanCoveredBecomesPlain` `tableRowsCellKeysCanonical`
- 長い文書の後ろでまたいで選んでも大きさの混在・下線の点灯が正しい・見直しは速く1フレーム1回・ドラッグ選択の予約は1回(#204)
  → `selectionWalkMixedSizeAtDocEnd` `selectionWalkUnderlineAtDocEnd` `selectionWalkFastAtDocEnd` `selectionWalkCoalescedPerFrame` `selectionWalkDragSyncOncePerFrame`
- 描き直し1回で番号・行き先を数えるのは1回・提案の索引・ロックの確かめは2回まで・変換で文書全体を文字列にしない・題名の打鍵はフレームで1回(#205)
  → renderShareSuite
- つまみ(段組みの幅・画像の幅)を押しただけでは Undo を積まない・最後が目次/ページでも下を押すと段落を足す・データベースの列のメニューが下の端で上に出る(#206)
  → ruleUnifySuite
- 大きな表(1500 行)で、同じ終点のドラッグ・行の入れ替え・絞り込み・全画面のスクロール・複数行の挿入削除・セルの移動の手間が小さく、結果は前と同じ(v280。#203)
  → bigTableOpsSuite

## コード全体のレビュー(2回目)の直し(v282。#212〜#228)
- 保存の途中の編集は変更ありのまま・保存は一度に1つ・開く失敗で見張りが止まらない・名前を付けて保存の失敗が見える(#212〜#215) → saveFlowSuite
- 動画・PDF を選んでも再生・読む位置が戻らない・ページを替えても添付を作り直さない・同じファイルは1つ・base64 は速い1つの変換(#216・#218・#221・#222) → attachViewSuite
- 保存のたびに添付をハッシュし直さない・保存HTMLは添付を必要なときに読む・大文字の sha256 も出る・印刷の枠に添付の中身を入れない(#217・#219・#220) → attachHashSuite
- Mermaid の図・二重の描き直し・グラフの描き直しが1回(#223〜#225) → redrawCountSuite
- 検索の色付け・Undo の控えの大きさ・フォントの読み直しと残り(#226〜#228) → searchUndoFontSuite

## Notion との差から足した機能(v283。形式 0.8.20)
- 表の絞り込みの条件(数・文字・日付・チェック)と列どうしの AND/OR。保存HTMLも同じ行を隠す(#180) → filterConditionSuite
- ブロックへのリンクをコピー・印で移って光る・別のページ・保存HTML・被リンクの一覧(#176・#188) → blockLinkSuite
- 呼び出し(絵文字つきの囲み)とブロックの色。Notion からの貼り付けもこの形。保存HTML・印刷も同じ見た目(#161・#162) → calloutColorSuite
- 文字数・番号の形(1.1 / 1. / a. / i.)・音声の再生(#189・#171・#164 の音声) → countListAudioSuite
- 絵文字の候補(「:smi」「:笑」)・文中の日付(「@今日」「@2026-10-30」。押して選び直す。保存HTMLは <time>)。IME の変換中・コード・URL・時刻では出ない(#175・#173)。絵文字の表は Unicode 公式データから scripts/build-emoji-data.mjs で作る(v290)。公式の名前(`:thumbs_up`・`:thumbsup`)・日本語の名前(「ロケット」)・旗(`:flag_japan`)でも出る → emojiDateSuite
- ブロックを別のページへ移す(子ごと・複数・Undo 1手)・ページのゴミ箱(元に戻す・完全に削除・リンクの場所も戻る・保存HTMLに出ない)(#193・#187) → moveTrashSuite
- Markdown の書き出し・読み込み(往復で並びが同じ・コードの言語も戻る・スクリプトは動かない)(#192) → markdownSuite
- 文書の書体・小さい文字・ページのアイコンとカバー(エディタと保存HTMLの位置が同じ・Undo・無害化)(#190・#184) → appearanceSuite
- コードの言語と色分け(17 言語・DOM は素の文字・IME・Undo・検索・貼り付け・長いコードでも打鍵が軽い)(#163) → codeHighlightSuite
- データベースの列の種類(複数選択・状態・URL・メール・電話・ファイル・作成/更新日時)とグループ分け(1000 行で軽い・保存HTMLも同じ組)(#178・#179) → dbMoreSuite
