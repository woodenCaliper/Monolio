// 絵文字の候補の表(Issue #175)。本文で「:」に続けて英字を2つ打つと(「:smi」)、app.js が初めてこのファイルを読み込む
// (ふだんは読まない)。ネットは使わない。1行が1つの絵文字で、「絵文字 英語の名前|日本語の名前 キーワード…」(空白で区切る。
// 英語の名前は一覧に出す。複数語は下線つなぎ)。並びは Unicode の分類順(同じ順位の候補はこの並びで出る)。
//
// このファイルは scripts/build-emoji-data.mjs が作る(手で直さない)。元は Unicode の公式データ:
//   - Unicode Emoji 18.0(emoji-test.txt。2026-04-30, 22:40:18 GMT): https://unicode.org/Public/emoji/latest/emoji-test.txt
//   - CLDR 49(annotations と annotationsDerived の en・ja): https://raw.githubusercontent.com/unicode-org/cldr/release-49/common/
//
// Copyright © 1991-2026 Unicode, Inc.
// Data files in this file are derived from Unicode Emoji data files and Unicode CLDR data files, distributed under the
// Unicode License v3 (SPDX-License-Identifier: Unicode-3.0): https://www.unicode.org/license.txt
window.MonolioEmojiData = `
😀 grinning_face|にっこり笑う スマイル ナイス にっこり ハッピー 笑う 笑顔 顔 cheerful cheery grin happy laugh nice smile smiling teeth
😃 grinning_face_with_big_eyes|わーい スマイル ハッピー 口を開けた笑顔 笑顔 顔 awesome grin happy mouth open smile smiling teeth yay
😄 grinning_face_with_smiling_eyes|笑顔 スマイル ハッピー わーい 顔 eye grin happy laugh lol mouth open smile
😁 beaming_face_with_smiling_eyes|にやっと笑う スマイル ナイス ハッピー 笑う 笑顔 顔 eye grin grinning happy nice smile teeth
😆 grinning_squinting_face|きゃー あはは うけるね スマイル 嬉しい 満足 笑 笑顔 顔 closed eyes haha hahaha happy laugh lol mouth open rofl smile smiling
😅 grinning_face_with_sweat|冷や汗笑顔 スマイル とほほ 冷や汗 汗 笑顔 顔 cold dejected excited mouth nervous open smile smiling stress stressed
🤣 rolling_on_the_floor_laughing|笑い転げる あはは うけるね スマイル 泣き笑い 涙 爆笑 笑う 笑顔 顔 crying face funny haha happy hehe hilarious joy laugh lmao lol rofl roflmao tear
😂 face_with_tears_of_joy|嬉し泣き あはは スマイル 大笑い 泣き笑い 涙 爆笑 笑う 笑顔 顔 crying feels funny haha happy hehe hilarious laugh lmao lol rofl roflmao tear
🙂 slightly_smiling_face|微笑む スマイル ハッピー ほほえみ 微笑み 笑顔 顔 happy smile
🙃 upside-down_face|さかさまの顔 さかさま 笑顔 顔 hehe smile
🫠 melting_face|溶けている顔 とろける 暑い 液体 溶けそう 溶ける 顔 disappear dissolve embarrassed haha heat hot liquid lol melt sarcasm sarcastic
🫫 cracking_face|ひび割れた顔 ひび マスク 割れる 壊れる 変身 正体 緊張 breaking crumbling masking resilience reveal tension transformation
😉 winking_face|ウインク ウィンク ウィンクする顔 顔 flirt heartbreaker sexy slide tease wink winks
😊 smiling_face_with_smiling_eyes|にこにこ スマイル 微笑み 満足 目を細める 頬を赤らめる 顔 blush eye glad satisfied smile
😇 smiling_face_with_halo|天使の輪がついた笑顔 スマイル ハッピー 天使の輪 平和 笑顔 顔 angel angelic angels blessed fairy fairytale fantasy happy innocent peaceful smile spirit tale
🥰 smiling_face_with_hearts|ハートの笑顔 ハート メロメロ ラブ 夢中 愛してる 笑顔 顔 3 adore crush heart ily love romance smile you
😍 smiling_face_with_heart-eyes|目がハートの笑顔 スマイル ハート ラブ 大好き 笑顔 顔 143 bae eye feels hearts ily kisses love romance romantic smile xoxo
🤩 star-struck|目が星の笑顔 スマイル わーい 星 笑顔 顔 excited eyes face grinning smile star starry-eyed wow
😘 face_blowing_a_kiss|投げキッス キス ちゅっ ハート 顔 adorbs bae flirt heart ily love lover miss muah romantic smooch xoxo you
😗 kissing_face|キス ちゅっ デート 顔 143 date dating flirt ily kiss love smooch smooches xoxo you
☺️ smiling_face|スマイリー スマイル ハッピー ほっ 笑顔 顔 happy outlined relaxed smile
😚 kissing_face_with_closed_eyes|ちゅっ キス デート 目を閉じてキス 目を閉じる 顔 143 bae blush date dating eye flirt ily kisses smooches xoxo
😙 kissing_face_with_smiling_eyes|にっこりキス キス スマイル ちゅっ 笑顔 顔 143 closed date dating eye flirt ily kiss kisses love night smile
🥲 smiling_face_with_tear|嬉し涙の顔 じーん 感動 感激 泣く 涙 顔 glad grateful happy joy pain proud relieved smile smiley touched
😋 face_savoring_food|にこにこぺろり うまい おいしい おいしそう スマイル ぺろり 笑顔 腹ぺこ 顔 delicious eat full hungry savor smile smiling tasty um yum yummy
😛 face_with_tongue|舌を出した顔 べー べろ 甘い 舌 顔 awesome cool nice party stuck-out sweet
😜 winking_face_with_tongue|あっかんべー ウィンク ジョーク べー 冗談 舌 顔 crazy epic eye funny joke loopy nutty party stuck-out wacky weirdo wink yolo
🤪 zany_face|ふざけた顔 おかしい ジョーク ふざけ 顔 crazy eye eyes goofy large small
😝 squinting_face_with_tongue|目を閉じてべー べー べろ わーい 味見 舌 顔 closed eye eyes gross horrible omg stuck-out taste whatever yolo
🤑 money-mouth_face|お金の顔 お金 べー べろ 舌 顔 money mouth paid
🤗 smiling_face_with_open_hands|ハグ スマイル 笑顔 顔 hug hugging
🤭 face_with_hand_over_mouth|口に手を当てた顔 おっと クスクス スマイル 内緒 笑顔 顔 giggle giggling oops realization secret shock sudden surprise whoops
🫢 face_with_open_eyes_and_hand_over_mouth|目を開けて口に手を当てた顔 おそれ おののき びっくり 静かに 顔 驚き amazement awe disbelief embarrass gasp omg quiet scared shock surprise
🫣 face_with_peeking_eye|指の間からのぞき見る顔 こわごわ ちらっ のぞき見 盗み見 顔 captivated embarrass hide hiding peek peep scared shy stare
🤫 shushing_face|しーっ しー シーッ しっ 静かに 顔 quiet shh shush
🤔 thinking_face|考える顔 うーん 考える 考え中 顎に手 顔 chin consider hmm ponder pondering wondering
🫡 saluting_face|敬礼する顔 オーケー 了解 敬礼 軍隊 顔 good luck ma’am ok respect salute sir troops yes
🤐 zipper-mouth_face|口チャック チャック 内緒 口 秘密 顔 keep mouth quiet secret shut zip zipper
🤨 face_with_raised_eyebrow|眉を上げた顔 不審 疑い 顔 驚き disapproval disbelief distrust emoji hmm mild skeptic skeptical skepticism surprise what
😐 neutral_face|ポーカーフェイス 無表情 笑えない 顔 awkward blank deadpan expressionless fine jealous meh oh shade straight unamused unhappy unimpressed whatever
😑 expressionless_face|無表情 ふーん やきもち 無感情 顔 awkward dead fine inexpressive jealous meh not oh omg straight uh unhappy unimpressed whatever
😶 face_without_mouth|口のない顔 だんまり 口なし 沈黙 無表情 無言 顔 awkward blank expressionless mouthless mute quiet secret silence silent speechless
🫥 dotted_line_face|点線の顔 どうでもいい ふーん 内向的 内気 憂鬱 落胆 顔 depressed disappear hidden hide introvert invisible meh whatever wtv
😶‍🌫️ face_in_clouds|雲の中の顔 うわの空 ぼんやり 夢中 放心状態 顔 absentminded fog head
😏 smirking_face|薄笑いをする顔 にやり ふっ 顔 boss dapper flirt homie kidding leer shade slick sly smirk smug snicker suave suspicious swag
😒 unamused_face|しらけた ジト目 しらけ しらける つまらない やきもち 不満 顔 ... bored fine jealous jel jelly pissed smh ugh uhh unhappy weird whatever
🙄 face_with_rolling_eyes|上を見る顔 あきれた うーん 上目 目をむく 顔 eyeroll shade ugh whatever
😬 grimacing_face|しかめ面 いー しかめっ面 しかめ顔 顔 awk awkward dentist grimace grinning smile smiling
😮‍💨 face_exhaling|息を吐く顔 あきらめ ため息 ほっとした 安心 息切れ 疲れた 顔 blow blowing exhale exhausted gasp groan relief sigh smiley smoke whisper whistle
🤥 lying_face|うそつきの顔 ピノキオの顔 嘘 嘘つき 顔 liar lie pinocchio
🫨 shaking_face|震えている顔 ガーン ショック なんてこった パニック ビックリ まいった 地震 振動 震えている 顔 crazy daze earthquake omg panic shock surprise vibrate whoa wow
🙂‍↔️ head_shaking_horizontally|首を横に振る いいえ 不賛成 顔 首を振る no shake
🙂‍↕️ head_shaking_vertically|首を縦に振る はい 頷く 顔 首を振る nod yes
😌 relieved_face|ほっとした顔 ほっ 安心 顔 calm peace relief zen
😔 pensive_face|しょぼーん がっかり しょんぼり 悲しい 考え込む顔 顔 awful bored dejected died disappointed losing lost sad sucks
😪 sleepy_face|眠い 寝る 疲れた 眠そうな顔 眠っている顔 眠る 顔 crying good night sad sleep sleeping tired
🤤 drooling_face|よだれを垂らした顔 よだれ 顔
😴 sleeping_face|寝る zzz おやすみ グーグー 寝顔 眠い 眠る 顔 bed bedtime good goodnight nap night sleep tired whatever yawn
🫩 face_with_bags_under_eyes|目にクマがある顔 クマ 徹夜 疲れた 眠い 顔 bored exhausted fatigued late sleepy tired weary
😷 face_with_medical_mask|マスク顔 ドクター マスク 医師 歯科医 病気 花粉症 顔 風邪 cold dentist dermatologist doctor dr germs medicine sick
🤒 face_with_thermometer|熱がある顔 体温計 熱を測る 病気 顔 風邪 ill sick
🤕 face_with_head-bandage|包帯を巻いた顔 ケガ ケガしてる顔 包帯 痛い 顔 bandage hurt injury ouch
🤢 nauseated_face|吐き気を催している顔 具合の悪い顔 吐きそう 気持ち悪い 病気 顔 gross nasty sick vomit
🤮 face_vomiting|嘔吐する顔 げろ 吐く 気持ち悪い 病気 顔 barf ew gross puke sick spew throw up vomit
🤧 sneezing_face|くしゃみする顔 くしゃみ 花粉症 顔 風邪 fever flu gesundheit sick sneeze
🥵 hot_face|暑い顔 暑さ 死にそう 汗 熱中症 発熱 舌を出した顔 赤い顔 dying feverish heat panting red-faced stroke sweating tongue
🥶 cold_face|寒い顔 しもやけ つらら 凍え 寒さ 氷点下 青 青い顔 顔 blue blue-faced freezing frostbite icicles subzero teeth
🥴 woozy_face|ふらふらの顔 うつろな目 べろんべろん ほろ酔い めまい 中毒 dizzy drunk eyes intoxicated mouth tipsy uneven wavy
😵 face_with_crossed-out_eyes|めまい ふらふら 疲れた 病気 顔 dead dizzy feels knocked out sick tired
😵‍💫 face_with_spiral_eyes|目を回した顔 くらくら ふらふら めまい 渦巻き 目がぐるぐる 目が回る confused dizzy hypnotized omg smiley trouble whoa woah woozy
🤯 exploding_head|頭爆発 ショック びっくり ぼんっ 爆発 顔 驚き blown explode mind mindblown no shocked way
🤠 cowboy_hat_face|カウボーイの顔 カウガール カウボーイ 帽子 顔 cowgirl
🥳 partying_face|パーティーの顔 おめでとう お祝い パーティー ハッピーバースデー 帽子 笑顔 笛 誕生日 bday birthday celebrate celebration excited happy hat hooray horn party
🥸 disguised_face|変装した顔 ひげ メガネ 仮装 口ひげ 変装 顔 disguise eyebrow glasses incognito moustache mustache nose person spy tache tash
😎 smiling_face_with_sunglasses|サングラスで笑顔 クール サングラス スマイル 眼鏡 笑顔 顔 awesome beach bright bro chilling cool rad relaxed shades slay smile style swag win
🤓 nerd_face|オタク エキスパート ガリ勉 マニア メガネ 優等生 利口 知的 秀才 顔 brainy clever expert geek gifted glasses intelligent smart
🧐 face_with_monocle|モノクルを付けた顔 メガネ 上品 片眼鏡 考える 顔 classy fancy rich stuffy wealthy
😕 confused_face|混乱 しかめ面 ふーん わからない 困惑 顔 befuddled confusing dunno frown hm meh not sad sorry sure
🫤 face_with_diagonal_mouth|口が斜めの顔 不信 不満 困惑 無気力 無関心 顔 confused confusion disappointed doubt doubtful frustrated frustration meh skeptical unsure whatever wtv
😟 worried_face|悩む顔 困った 心配 悲しい 顔 anxious butterflies nerves nervous sad stress stressed surprised worry
🙁 slightly_frowning_face|少し困った顔 しかめ面 困った 少し困った 顔 frown sad
☹️ frowning_face|困った顔 しかめ面 困った 悲しい 顔 frown sad
😮 face_with_open_mouth|口が開いた顔 へー 信じられない 共感 顔 驚き believe forgot omg shocked surprised sympathy unbelievable unreal whoa wow you
😯 hushed_face|ぽかーん すごいね びっくり びっくり顔 顔 驚き epic omg stunned surprised whoa woah
😲 astonished_face|びっくり えーっ びっくりした顔 まさか 顔 驚き 驚愕 cost no omg shocked totally way
😳 flushed_face|赤面 えーっ とまどい 赤くなる 顔 驚き amazed awkward crazy dazed dead disbelief embarrassed geez heat hot impressed jeez what wow
🫪 distorted_face|ゆがんだ顔 あぜん ショック ぼう然 不安 膨れた 驚いた anxiety bloated panic shocked surprised vulnerable
🥺 pleading_face|訴えるような顔 お願い ぴえん 大きな目 子犬の目 悲しみ 情け 懇願 顔 begging big eyes mercy not please pretty puppy sad why
🥹 face_holding_back_tears|涙をこらえた顔 うるうる 嬉し泣き 懇願 泣き顔 涙 顔 admiration aww cry embarrassed feelings grateful gratitude joy please proud resist sad
😦 frowning_face_with_open_mouth|あきれ顔 しかめ面 しかめ顔 ぽかーん 不本意 不満 口を開けた顔 呆然 顔 驚き caught frown guard scared scary surprise what wow
😧 anguished_face|苦悩 困った顔 苦悶 顔 驚き forgot scared scary stressed surprise unhappy what wow
😨 fearful_face|青ざめ がーん 不安 怖い 青ざめた顔 顔 afraid anxious blame fear scared worried
😰 anxious_face_with_sweat|冷や汗青ざめ 冷や汗 寒い 汗 青い顔 青ざめ 顔 blue cold eek mouth nervous open rushed scared yikes
😥 sad_but_relieved_face|どうしよう 困った 汗 顔 anxious call close complicated disappointed not sweat time whew
😢 crying_face|泣き顔 ひどい 寂しい 悲しい 泣く 涙 顔 awful cry feels miss sad tear triste unhappy
😭 loudly_crying_face|大泣き 号泣 号泣する顔 悲しい 泣く 涙 顔 bawling cry sad sob tear tears unhappy
😱 face_screaming_in_fear|恐怖 がーん ショック 叫び 叫んでいる顔 顔 驚き epic fearful munch scared scream screamer shocked surprised woah
😖 confounded_face|困惑した顔 困った 困惑 混乱 顔 annoyed confused cringe distraught feels frustrated mad sad
😣 persevering_face|我慢 我慢する顔 頭痛 顔 concentrate concentration focus headache persevere
😞 disappointed_face|失望した顔 がっかり がっくり 悲しい 残念 顔 awful blame dejected fail losing sad unhappy
😓 downcast_face_with_sweat|冷や汗 さむけ 汗 肝を冷やした 頭痛 顔 close cold feels headache nervous sad scared yikes
😩 weary_face|あきらめ へとへと 泣き顔 疲れ 腹ぺこ 顔 crying fail feels hungry mad nooo sad sleepy tired unhappy
😫 tired_face|疲れた くしゃみ 疲れ 疲れた顔 限界 顔 cost feels nap sad sneeze
🥱 yawning_face|あくびした顔 おやすみ ふあ～ 疲れ 眠い 退屈 顔 bedtime bored goodnight nap night sleep sleepy tired whatever yawn zzz
😤 face_with_steam_from_nose|勝ち誇った顔 ふんっ 得意気 怒り 顔 鼻息 anger angry feels fume fuming furious fury mad triumph unhappy won
😡 enraged_face|ふくれっ面 かんかん ぷんぷん 怒り 激怒 赤い顔 顔 anger angry feels mad maddening pouting rage red shade unhappy upset
😠 angry_face|ぷんぷん 不満 怒った 怒った顔 怒り 顔 anger blame feels frustrated mad maddening rage shade unhappy upset
🤬 face_with_symbols_on_mouth|ののしる シンボルが口にある顔 ののしり 怒り 悪口 検閲 顔 censor cursing cussing mad pissed swearing
😈 smiling_face_with_horns|笑った悪魔 スマイル デビル 悪魔 笑顔 角 顔 demon devil evil fairy fairytale fantasy purple shade smile tale
👿 angry_face_with_horns|怒った悪魔 かんかん デビル 悪魔 激怒 角 顔 demon devil evil fairy fairytale fantasy imp mischievous purple shade tale
💀 skull|ドクロ スカル 死 死者 頭蓋骨 顔 骸骨 body dead death face fairy fairytale i’m lmao monster tale yolo
☠️ skull_and_crossbones|ドクロと骨 スカル ドクロ 死 顔 骨 骸骨 bone dead death face monster
💩 pile_of_poo|うんち うんこ 臭い 顔 bs comic doo dung face fml monster poop smelly smh stink stinks stinky turd
🤡 clown_face|ピエロの顔 ピエロ 道化師 顔
👹 ogre|鬼 お面 なまはげ 化け物 怖い 顔 creature devil face fairy fairytale fantasy mask monster scary tale
👺 goblin|天狗 お面 怒り angry creature face fairy fairytale fantasy mask mean monster tale
👻 ghost|お化け ゴースト ハロウィーン ユーレイ 幽霊 怖い boo creature excited face fairy fairytale fantasy halloween haunting monster scary silly tale
👽 alien|エイリアン ufo ユーフォー 宇宙人 異星人 顔 creature extraterrestrial face fairy fairytale fantasy monster space tale
👾 alien_monster|インベーダー エイリアン ゲーム スペースインベーダー モンスター 宇宙人 異星人 creature extraterrestrial face fairy fairytale fantasy game gamer games pixelated space tale ufo
🤖 robot|ロボット ロボットの顔 顔 face monster
😺 grinning_cat|にっこり笑う猫 スマイル 動物 猫 笑顔 顔 animal face mouth open smile smiling
😸 grinning_cat_with_smiling_eyes|にやっと笑う猫 スマイル 動物 猫 笑う 笑顔 顔 animal eye face grin smile
😹 cat_with_tears_of_joy|嬉し泣きする猫 スマイル 動物 涙 爆笑 猫 笑顔 顔 animal face laugh laughing lol tear
😻 smiling_cat_with_heart-eyes|目がハートの猫 スマイル ハート 動物 猫 笑顔 顔 animal eye face heart love smile
😼 cat_with_wry_smile|にやりとする猫 にやり ふっ 動物 猫 顔 animal face ironic
😽 kissing_cat|猫のキス キス ちゅっ 動物 猫 顔 animal closed eye eyes face kiss
🙀 weary_cat|絶望する猫 がーん ショック びっくり 動物 猫 顔 animal face oh surprised
😿 crying_cat|泣いている猫 動物 悲しい 泣く 涙 猫 顔 animal cry face sad tear
😾 pouting_cat|不機嫌な猫 ぷんぷん 不機嫌 動物 猫 顔 animal face
🙈 see-no-evil_monkey|見ざる 三猿 動物 猿 目隠し 隠す embarrassed evil face forbidden forgot gesture hide no omg prohibited scared secret smh watch
🙉 hear-no-evil_monkey|聞かざる 三猿 猿 秘密 animal ears evil face forbidden gesture hear listen no not prohibited secret shh tmi
🙊 speak-no-evil_monkey|言わざる 三猿 内緒 黙る 猿 秘密 animal evil face forbidden gesture no not oops prohibited quiet secret speak stealth
💌 love_letter|ラブレター ハート バレンタインデー 封筒 恋文 手紙 heart mail romance valentine
💘 heart_with_arrow|ハートに矢 キューピッド ハート 矢 143 adorbs cupid date emotion ily love romance valentine
💝 heart_with_ribbon|ハートにリボン ハート バレンタインデー リボン 記念日 143 anniversary emotion ily kisses valentine xoxo
💖 sparkling_heart|きらきらハート きらきら キラキラ ハート 143 emotion excited good ily kisses morning night sparkle xoxo
💗 growing_heart|大きくなるハート ドキドキ ときめき ハート 143 emotion excited heartpulse ily kisses muah nervous pulse xoxo
💓 beating_heart|ドキドキするハート ドキドキ ハート 動悸 鼓動 143 cardio emotion heartbeat ily love pulsating pulse
💞 revolving_hearts|回転するハート かわいい ハート 143 adorbs anniversary emotion heart
💕 two_hearts|2つのハート デート ハート ラブ 記念日 143 anniversary date dating emotion heart ily kisses love loving xoxo
💟 heart_decoration|ハートデコ ハート ハートデコレーション 白いハート 紫のハート 143 emotion hearth purple white
❣️ heart_exclamation|ハートのびっくり エクスクラメーションマーク ハート びっくりマーク bang heavy mark punctuation
💔 broken_heart|割れたハート ハート ハートブレイク 別れ 別れた 壊れたハート 失恋 break crushed emotion heartbroken lonely sad
❤️‍🔥 heart_on_fire|燃えるハート ハート 愛 火の付いた 炎 聖なる心臓 burn love lust sacred
❤️‍🩹 mending_heart|包帯を巻いたハート ケガ ハート 傷ついた 傷心 包帯 healthier improving recovering recuperating well
❤️ red_heart|赤いハート ハート 愛 赤 emotion love
🩷 pink_heart|ピンクのハート かわいい スペシャル ハート ピンク ラブ 好き 愛 愛してる 気持ち 143 adorable cute emotion ily like love special sweet
🧡 orange_heart|オレンジのハート オレンジ ハート 143
💛 yellow_heart|黄色のハート ハート 愛 黄色 黄色いハート 143 cardiac emotion ily love
💚 green_heart|緑のハート ハート 緑 143 emotion ily love romantic
💙 blue_heart|青いハート ハート 青 143 emotion ily love romance
🩵 light_blue_heart|薄い青のハート かわいい シアン ティールブルー ハート ラブ 好き 愛 水色 空色 薄い青 143 cute cyan emotion ily like love sky special teal
💜 purple_heart|紫のハート ハート 愛 紫 143 bestest emotion ily love
🤎 brown_heart|茶色いハート ハート 茶色 143
🖤 black_heart|黒いハート ハート 悪意 黒 evil wicked
🩶 grey_heart|灰色のハート グレー スレートグレー ハート ラブ 好き 愛 灰色 銀色 143 emotion gray ily love silver slate special
🤍 white_heart|白いハート ハート 白 143
💋 kiss_mark|キスマーク キス セクシー ちゅっ 唇 dating emotion heart kissing lips romance sexy
💯 hundred_points|100点満点 100 100点 全問正解 満点 a+ agree clearly definitely faithful fleek full keep perfect point score true truth yup
💢 anger_symbol|むかっ ＃ マンガ 怒った 怒り 怒りマーク angry comic mad upset
🫯 fight_cloud|ボカスカ ケンカ バトル 争い 取っ組み合い 喧嘩 土煙 argument brawl debate disagreement ruckus wrestle
💥 collision|衝突 どんっ ぼんっ マンガ 爆発 衝撃 bomb boom collide comic explode
💫 dizzy|くらくら きらきら キラキラ 星 流れ星 目が回る comic shining shooting star stars
💦 sweat_droplets|あせあせ しずく 水滴 汗 comic drip droplet drops splashing squirt water wet work workout
💨 dashing_away|ダッシュ マンガ 急ぐ 急げ 走る 逃げる cloud comic dash fart fast go gone gotta running smoke
🕳️ hole|穴
💬 speech_balloon|会話の吹き出し セリフ トーク マンガ メッセージ 会話 吹き出し bubble comic dialog message sms talk text typing
👁️‍🗨️ eye_in_speech_bubble|吹き出しの目 吹き出し 目 目撃 balloon witness
🗨️ left_speech_bubble|吹き出し左 セリフ 会話 吹き出し balloon dialog
🗯️ right_anger_bubble|怒りの吹き出し 吹き出し 怒り angry balloon mad
💭 thought_balloon|雲形の吹き出し マンガ もくもく 吹き出し 空想 考え事 雲 bubble cartoon cloud comic daydream decisions dream idea invent invention realize think thoughts wonder
💤 zzz|グーグー いびき おやすみ マンガ 寝る 就寝中 comic good goodnight night sleep sleeping sleepy tired
👋 waving_hand|手を振る あいさつ さようなら バイバイ ハロー またね 手 bye cya g2g greetings gtg hello hey hi later outtie ttfn ttyl wave yo you
🤚 raised_back_of_hand|手の甲 手 backhand
🖐️ hand_with_fingers_splayed|開いた手 ストップ パー 手 挙手 finger raised stop
✋ raised_hand|挙手 5 ストップ パー 手 five high stop
🖖 vulcan_salute|バルカンの挨拶 バルカンサイン バルカン人 手 finger hand hands
🫱 rightwards_hand|右に向けた手 右側 手 握手 方向 handshake hold reach right rightward shake
🫲 leftwards_hand|左に向けた手 左側 手 握手 方向 handshake hold left leftward reach shake
🫳 palm_down_hand|下に向けた手 下 手 拾う 落とす dismiss drop dropped pick shoo up
🫴 palm_up_hand|上に向けた手 おいで ちょうだい 上 受ける 差し出す 手 beckon catch come hold know lift me offer tell
🫷 leftwards_pushing_hand|左向きに押している手 ストップ ちょっと待って ハイタッチ 左向き 待った 待て 手 押す 断る 止まれ block five halt high hold leftward pause push refuse slap stop wait
🫸 rightwards_pushing_hand|右向きに押している手 ストップ ちょっと待って ハイタッチ 右向き 待った 待て 手 押す 断る 止まれ block five halt high hold pause push refuse rightward slap stop wait
👌 ok_hand|okの手 オーケー オッケー つまむ 手 awesome bet dope fleek fosho got gotcha legit okay pinch rad sure sweet three
🤌 pinched_fingers|上向きにすぼめた手 ジェスチャー すぼめる 手 指 gesture hand hold huh interrogation patience relax sarcastic ugh what zip
🤏 pinching_hand|つまんでいる指 ちょっと 少しだけ 手 指 amount bit fingers little small sort
✌️ victory_hand|vサイン チョキ ピース 手 指 peace v
🤞 crossed_fingers|指をクロス 幸運を 手 指 cross finger hand luck
🫰 hand_with_index_finger_and_thumb_crossed|親指と人差し指をクロス お金 愛 手 指 指ハート 指をクロス <3 expensive heart love money snap
🤟 love-you_gesture|アイラブユー 愛してる 手 fingers hand ily love three you
🤘 sign_of_the_horns|角の指サイン キツネ ロックオン 人差し指と小指を立てた手 手 finger hand rock-on
🤙 call_me_hand|電話の合図 手 電話 電話のジェスチャー hang loose shaka
👈 backhand_index_pointing_left|左指差し 左 手 指 指差し finger hand point
👉 backhand_index_pointing_right|右指差し 右 手 指 指差し finger hand point
👆 backhand_index_pointing_up|手の甲上指差し 上 手 指 指差し finger hand point
🖕 middle_finger|立てた中指 上 中指 手 指 指差し hand
👇 backhand_index_pointing_down|下指差し 下 手 指 指差し finger hand point
☝️ index_pointing_up|上指差し 上 手 指差し finger hand point this
🫵 index_pointing_at_the_viewer|人を指差している手 おまえだ 手 指 指差し 指摘 finger hand poke you
👍 thumbs_up|サムズアップ ok いいね オーケー オッケー グッド 上 了解 手 親指 +1 good hand like thumb yes
👎 thumbs_down|サムズダウン ng だめ ブーイング ボツ 下 手 -1 bad dislike good hand no nope thumb
🫹 leftwards_thumb_sign|左向きの親指 あれ これ 中立 左 指差す 握る grip left neutral point that this
🫺 rightwards_thumb_sign|右向きの親指 あれ これ 中立 右 指差す 握る grip neutral point right that this
✊ raised_fist|げんこつ グー こぶし 手 挙げたこぶし clenched hand punch solidarity
👊 oncoming_fist|グー げんこつ こぶし パンチ 手 absolutely agree boom bro bruh bump clenched correct hand knuckle pound punch rock ttyl
🤛 left-facing_fist|左向きのこぶし こぶし パンチ 左 手 leftwards
🤜 right-facing_fist|右向きのこぶし こぶし パンチ 右 手 rightwards
👏 clapping_hands|拍手 おめでとう パチパチ 手 手を叩く applause approval awesome clap congrats congratulations excited good great hand homie job nice prayed well yay
🙌 raising_hands|バンザイ ジェスチャー 両手 手 手を上げる celebration gesture hand hooray praise raised
🫶 heart_hands|ハート形の手 ハート ハートポーズ ラブ 両手ハート 愛 手 <3 love you
👐 open_hands|両手のひら おっはー 手 手のひら 開いた両手 hand hug jazz swerve
🤲 palms_up_together|手のひらを揃えた両手 両手 包む手 手 祈り cupped dua hands pray prayer wish
🤝 handshake|握手 よろしく 合意 契約成立 手 agreement deal hand meeting shake
🙏 folded_hands|祈り ありがとう お願い ごめんなさい ジェスチャー ハイタッチ 合掌 手 appreciate ask beg blessed bow cmon five gesture hand high please pray thanks thx
✍️ writing_hand|書いている手 手 手で書く 手書き write
💅 nail_polish|マニキュアを塗る手 ネイル マニキュア 爪 bored care cosmetics done makeup manicure whatever
🤳 selfie|セルフィー カメラ スマホ 自分撮り 自撮り camera phone
💪 flexed_biceps|力こぶ ボディビル ムキムキ 筋トレ 筋肉 腕 arm beast bench bodybuilder bro curls flex gains gym jacked muscle press ripped strong weightlift
🦾 mechanical_arm|義手 アクセシビリティ 人工装具 手 腕 accessibility prosthetic
🦿 mechanical_leg|義足 アクセシビリティ 人工装具 脚 足 accessibility prosthetic
🦵 leg|脚 キック 曲げた脚 膝 足 bent foot kick knee limb
🦶 foot|足 キック くるぶし ダンス 足首 踏みつける ankle feet kick stomp
👂 ear|耳 からだ 聞き耳 聞く body ears hear hearing listen listening sound
🦻 ear_with_hearing_aid|補聴器を付けた耳 アクセシビリティ 耳 聴覚 難聴 accessibility hard
👃 nose|鼻 からだ body noses nosey odor smell smells
🧠 brain|脳 知識 脳みそ 頭 intelligent smart
🫀 anatomical_heart|心臓 心拍 脈 臓器 鼓動 beat cardiology heartbeat organ pulse real red
🫁 lungs|肺 呼吸 臓器 breath breathe exhalation inhalation lung organ respiration
🦷 tooth|歯 歯医者 白い歯 dentist pearly teeth white
🦴 bone|骨 犬 骨格 bones dog skeleton wishbone
👀 eyes|目 からだ 両目 動く目玉 body eye face googly look looking omg peep see seeing
👁️ eye|片目 からだ 一つ目 目 1 body one
👅 tongue|舌 からだ べー べろ body lick slurp
👄 mouth|口 からだ キス 唇 beauty body kiss kissing lips lipstick
🫦 biting_lip|唇を咬んでいる口 セクシー チッ 口 口惜しさ 唇 悔しい 誘惑 anxious bite fear flirt flirting kiss lipstick nervous sexy uncomfortable worried worry
👶 baby|赤ん坊 ベビー 子供 新生児 赤ちゃん 顔 babies children goo infant newborn pregnant young
🧒 child|子供 キッズ 中性的 子ども 顔 bright-eyed grandchild kid young younger
👦 boy|男の子 子供 少年 顔 bright-eyed child grandson kid son young younger
👧 girl|女の子 おさげ 女 娘 子供 少女 顔 bright-eyed child daughter granddaughter kid virgo young younger zodiac
🧑 person|大人 中性的 成人 顔 adult
👱 person_blond_hair|金髪の人 ブロンド 人 人間 金髪 顔 blond-haired human
👨 man|男性 大人 男 顔 adult bro
🧔 person_beard|あごひげの人 あごひげ ひげ 人 顔 bearded whiskers
🧔‍♂️ man_beard|あごひげの男性 あごひげ ひげ 男 顔 bearded whiskers
🧔‍♀️ woman_beard|あごひげの女性 あごひげ ひげ 女 顔 bearded whiskers
👨‍🦰 man_red_hair|男性_赤毛 大人 男 男性 赤毛 顔 adult bro red_hair
👨‍🦱 man_curly_hair|男性_巻き毛 大人 巻き毛 男 男性 顔 adult bro curly_hair
👨‍🦳 man_white_hair|男性_白髪 大人 男 男性 白髪 顔 adult bro white_hair
👨‍🦲 man_bald|男性_はげ頭 はげ頭 大人 男 男性 顔 adult bro
👩 woman|女性 大人 女 顔 adult lady
👩‍🦰 woman_red_hair|女性_赤毛 大人 女 女性 赤毛 顔 adult lady red_hair
🧑‍🦰 person_red_hair|大人_赤毛 中性的 大人 成人 赤毛 顔 adult red_hair
👩‍🦱 woman_curly_hair|女性_巻き毛 大人 女 女性 巻き毛 顔 adult curly_hair lady
🧑‍🦱 person_curly_hair|大人_巻き毛 中性的 大人 巻き毛 成人 顔 adult curly_hair
👩‍🦳 woman_white_hair|女性_白髪 大人 女 女性 白髪 顔 adult lady white_hair
🧑‍🦳 person_white_hair|大人_白髪 中性的 大人 成人 白髪 顔 adult white_hair
👩‍🦲 woman_bald|女性_はげ頭 はげ頭 大人 女 女性 顔 adult lady
🧑‍🦲 person_bald|大人_はげ頭 はげ頭 中性的 大人 成人 顔 adult
👱‍♀️ woman_blond_hair|金髪の女性 ブロンド 女 女性 金髪 blond-haired blonde
👱‍♂️ man_blond_hair|金髪の男性 ブロンド 男 男性 金髪 blond-haired
🧓 older_person|お年寄り 中性的 大人 老人 顔 高齢者 adult elderly grandparent old wise
👴 old_man|おじいさん おじいちゃん お年寄り 男性 老人 薄毛 顔 高齢者 adult bald elderly gramps grandfather grandpa wise
👵 old_woman|おばあさん おばあちゃん お年寄り 女性 老人 顔 高齢者 adult elderly grandma grandmother granny lady wise
🙍 person_frowning|しかめ面の人 しかめっ面 しかめ顔 むっとしている人 不満 失望 annoyed disappointed disgruntled disturbed frown frustrated gesture irritated upset
🙍‍♂️ man_frowning|しかめ面の男 しかめっ面 しかめ顔 むっとしている男 男 男性 annoyed disappointed disgruntled disturbed frown frustrated gesture irritated upset
🙍‍♀️ woman_frowning|しかめ面の女 しかめっ面 しかめ顔 女 女性 annoyed disappointed disgruntled disturbed frown frustrated gesture irritated upset
🙎 person_pouting|不機嫌な人 ふくれる ぷんぷん 不機嫌 口を尖らせた人 険しい表情 disappointed downtrodden frown grimace scowl sulk upset whine
🙎‍♂️ man_pouting|不機嫌な男 ぷんぷん 不機嫌 口を尖らせた男 男 男性 disappointed downtrodden frown grimace scowl sulk upset whine
🙎‍♀️ woman_pouting|不機嫌な女 ぷんぷん 不機嫌 女 女性 disappointed downtrodden frown grimace scowl sulk upset whine
🙅 person_gesturing_no|ダメのポーズをする人 ng お断り ジェスチャー だめ バツ 人 禁止 禁止された 除外 forbidden gesture hand not prohibit
🙅‍♂️ man_gesturing_no|ダメのポーズをする男 ng ジェスチャー バツ 男 男性 禁止 forbidden gesture hand not prohibit
🙅‍♀️ woman_gesturing_no|ダメのポーズをする女 ng ジェスチャー バツ 女 女性 forbidden gesture hand not prohibit
🙆 person_gesturing_ok|okのポーズをする人 エクササイズ オーケー ジェスチャー びっくり 丸 人 手 exercise gesture hand omg
🙆‍♂️ man_gesturing_ok|okのポーズをする男 オーケー オッケー ジェスチャー 丸 男 男性 exercise gesture hand omg
🙆‍♀️ woman_gesturing_ok|okのポーズをする女 オーケー オッケー ジェスチャー 丸 女性 exercise gesture hand omg
💁 person_tipping_hand|案内する人 ゴシップ ジェスチャー 受付 受付嬢 手を返している人 案内 案内する女 髪をかき上げる 髪を振り払う fetch flick flip gossip sarcasm sarcastic sassy seriously whatever
💁‍♂️ man_tipping_hand|案内する男 ジェスチャー 案内 男 男性 fetch flick flip gossip sarcasm sarcastic sassy seriously whatever
💁‍♀️ woman_tipping_hand|案内する女 ジェスチャー 女 女性 案内 fetch flick flip gossip sarcasm sarcastic sassy seriously whatever
🙋 person_raising_hand|手を挙げる人 ジェスチャー 人 分かった 手 手を挙げる 挙手 質問 gesture here know me pick question raise
🙋‍♂️ man_raising_hand|手を挙げる男 手を挙げる 挙手 男 男性 gesture here know me pick question raise
🙋‍♀️ woman_raising_hand|手を挙げる女 女 女性 手を挙げる 挙手 gesture here know me pick question raise
🧏 deaf_person|耳の不自由な人 アクセシビリティ 人 聞こえない 聴覚 障がい accessibility ear gesture hear
🧏‍♂️ deaf_man|耳の不自由な男性 アクセシビリティ 男性 聴覚 障がい accessibility ear gesture hear
🧏‍♀️ deaf_woman|耳の不自由な女性 アクセシビリティ 女性 聴覚 障がい accessibility ear gesture hear
🙇 person_bowing|おじぎする人 おじぎ お願い ごめんなさい ジェスチャー 土下座 許して 謝罪 apology ask beg bow favor forgive gesture meditate meditation pity regret sorry
🙇‍♂️ man_bowing|おじぎする男 おじぎ ごめんなさい 土下座 男 男性 apology ask beg bow favor forgive gesture meditate meditation pity regret sorry
🙇‍♀️ woman_bowing|おじぎする女 おじぎ ごめんなさい 土下座 女 女性 apology ask beg bow favor forgive gesture meditate meditation pity regret sorry
🤦 person_facepalming|ひたいに手をあてる人 あちゃー うそでしょ ジェスチャー ショック ひたいに手 またか 人 信じられない again bewilder disbelief exasperation facepalm no not oh omg shock smh
🤦‍♂️ man_facepalming|ひたいに手をあてる男 あちゃー うそでしょ ジェスチャー ショック ひたいに手 またか 信じられない 男 男性 again bewilder disbelief exasperation facepalm no not oh omg shock smh
🤦‍♀️ woman_facepalming|ひたいに手をあてる女 あちゃー うそでしょ ジェスチャー ショック ひたいに手 またか 信じられない 女 女性 again bewilder disbelief exasperation facepalm no not oh omg shock smh
🤷 person_shrugging|お手上げする人 お手上げ さあね ジェスチャー わかりません 人 多分ね 知らない 肩をすくめる doubt dunno guess idk ignorance indifference knows maybe shrug whatever who
🤷‍♂️ man_shrugging|お手上げする男 お手上げ さあね ジェスチャー わかりません 多分ね 男 男性 知らない 肩をすくめる doubt dunno guess idk ignorance indifference knows maybe shrug whatever who
🤷‍♀️ woman_shrugging|お手上げする女 お手上げ さあね ジェスチャー わかりません 多分ね 女 女性 知らない 肩をすくめる doubt dunno guess idk ignorance indifference knows maybe shrug whatever who
🧑‍⚕️ health_worker|医者 セラピスト 医師 doctor healthcare nurse therapist
👨‍⚕️ man_health_worker|男性の医者 セラピスト ドクター 医師 医者 男 男性 doctor healthcare nurse therapist
👩‍⚕️ woman_health_worker|女性の医者 セラピスト ドクター 医師 医者 女 女医 女性 doctor healthcare nurse therapist
🧑‍🎓 student|学生 卒業 角帽 graduate
👨‍🎓 man_student|男子学生 卒業 学生 男 男性 角帽 graduate
👩‍🎓 woman_student|女子学生 卒業 女 女性 学生 角帽 graduate
🧑‍🏫 teacher|教師 先生 担任 教授 講師 instructor lecturer professor
👨‍🏫 man_teacher|男性の教師 先生 教師 教授 男 男性 講師 instructor lecturer professor
👩‍🏫 woman_teacher|女性の教師 先生 女 女性 教師 教授 講師 instructor lecturer professor
🧑‍⚖️ judge|裁判官 裁判 justice law scales
👨‍⚖️ man_judge|男性の裁判官 男 男性 裁判 裁判官 justice law scales
👩‍⚖️ woman_judge|女性の裁判官 女 女性 裁判 裁判官 justice law scales
🧑‍🌾 farmer|農家 ガーデナー 農場主 農業 gardener rancher
👨‍🌾 man_farmer|農家の男性 男 男性 農夫 農家 gardener rancher
👩‍🌾 woman_farmer|農家の女性 女 女性 農家 gardener rancher
🧑‍🍳 cook|コック シェフ 料理 chef
👨‍🍳 man_cook|男性のコック コック シェフ 料理 料理人 男 男性 chef
👩‍🍳 woman_cook|女性のコック コック シェフ 女 女性 料理 料理人 chef
🧑‍🔧 mechanic|整備士 スパナ メカニック 作業員 工作 electrician plumber tradesperson
👨‍🔧 man_mechanic|男性の整備士 スパナ メカニック 工作 男 男性 配管工 電気工 electrician plumber tradesperson
👩‍🔧 woman_mechanic|女性の整備士 スパナ メカニック 女 女性 工作 配管工 電気工 electrician plumber tradesperson
🧑‍🏭 factory_worker|溶接工 モノづくり 工員 工場 assembly industrial
👨‍🏭 man_factory_worker|男性の溶接工 工員 溶接 男 男性 assembly industrial
👩‍🏭 woman_factory_worker|女性の溶接工 女 女性 工員 溶接 assembly industrial
🧑‍💼 office_worker|会社員 サラリーマン ビジネスパーソン architect business manager white-collar
👨‍💼 man_office_worker|男性会社員 サラリーマン ビジネスパーソン ビジネスマン 会社員 男性 architect business manager white-collar
👩‍💼 woman_office_worker|女性会社員 ol サラリーマン ビジネスパーソン 会社員 女 女性 architect business manager white-collar
🧑‍🔬 scientist|科学者 化学者 物理学者 生物学者 biologist chemist engineer mathematician physicist
👨‍🔬 man_scientist|男性科学者 男 男性 科学者 biologist chemist engineer mathematician physicist
👩‍🔬 woman_scientist|女性科学者 女 女性 科学者 biologist chemist engineer mathematician physicist
🧑‍💻 technologist|技術者 コンピュータ パソコン プログラマ 開発者 coder computer developer inventor software
👨‍💻 man_technologist|男性技術者 コンピュータ デベロッパ パソコン プログラマ プログラマー 男 男性 開発者 coder computer developer inventor software
👩‍💻 woman_technologist|女性技術者 コンピュータ デベロッパ パソコン プログラマ プログラマー 女 女性 開発者 coder computer developer inventor software
🧑‍🎤 singer|歌手 アーティスト シンガー スター ロッカー actor entertainer rock rockstar star
👨‍🎤 man_singer|男性歌手 アーティスト エンターテイナー シンガー スター ロックスター 俳優 歌手 男 男性 actor entertainer rock rockstar star
👩‍🎤 woman_singer|女性歌手 アーティスト エンターテイナー シンガー スター ロックスター 俳優 女 女性 歌手 actor entertainer rock rockstar star
🧑‍🎨 artist|芸術家 アーティスト 画家 絵描き palette
👨‍🎨 man_artist|男性の芸術家 アーティスト 男 男性 画家 芸術家 palette
👩‍🎨 woman_artist|女性の芸術家 アーティスト パレット 女 女性 画家 芸術家 palette
🧑‍✈️ pilot|パイロット 操縦士 機長 plane
👨‍✈️ man_pilot|男性パイロット パイロット 操縦士 男 男性 plane
👩‍✈️ woman_pilot|女性パイロット 女 女性 操縦士 plane
🧑‍🚀 astronaut|宇宙飛行士 ロケット rocket space
👨‍🚀 man_astronaut|男性宇宙飛行士 宇宙飛行士 男 男性 rocket space
👩‍🚀 woman_astronaut|女性宇宙飛行士 女 女性 宇宙飛行士 rocket space
🧑‍🚒 firefighter|消防士 レスキュー 救助隊 fire firetruck
👨‍🚒 man_firefighter|男性消防士 消防士 男 男性 fire firetruck
👩‍🚒 woman_firefighter|女性消防士 女 女性 消防士 fire firetruck
👮 police_officer|警察官 お巡りさん 警官 警察 逮捕する apprehend arrest citation cop law over pulled undercover
👮‍♂️ man_police_officer|男性警察官 お巡りさん 男性 警官 警察 警察官 apprehend arrest citation cop law over pulled undercover
👮‍♀️ woman_police_officer|女性警察官 お巡りさん 女性 警官 警察 警察官 apprehend arrest citation cop law over pulled undercover
🕵️ detective|探偵 スパイ 私立探偵 虫めがね sleuth spy
🕵️‍♂️ man_detective|男性の探偵 探偵 男 男性 虫めがね sleuth spy
🕵️‍♀️ woman_detective|女性の探偵 女 女性 探偵 私立探偵 虫めがね sleuth spy
💂 guard|衛兵 守衛 警備 門番 buckingham helmet london palace
💂‍♂️ man_guard|男性の衛兵 守衛 男性 衛兵 警備 門番 buckingham helmet london palace
💂‍♀️ woman_guard|女性の衛兵 女性 守衛 衛兵 警備 門番 buckingham helmet london palace
🥷 ninja|忍者 スパイ 人 忍び 忍術 草の者 隠密 assassin fight fighter hidden person secret skills sly soldier stealth war
👷 construction_worker|建設作業員 ハンマー ヘルメット 作業員 工事 建設 build fix hardhat hat man person rebuild remodel repair work
👷‍♂️ man_construction_worker|男性の建設作業員 ハンマー ヘルメット 作業員 工事 建設 男 男性 build fix hardhat hat rebuild remodel repair work
👷‍♀️ woman_construction_worker|女性の建設作業員 ハンマー ヘルメット 作業員 女 女性 工事 建設 build fix hardhat hat man rebuild remodel repair work
🫅 person_with_crown|王冠をかぶった人 君主 国王 女王 王 王家 王族 王様 monarch noble regal royal royalty
🤴 prince|プリンス 王子 王族 男 男性 crown fairy fairytale fantasy king royal royalty tale
👸 princess|プリンセス お姫さま クイーン 冠 女 女性 女王 王女 王妃 crown fairy fairytale fantasy queen royal royalty tale
👳 person_wearing_turban|ターバンの人 ターバン 帽子
👳‍♂️ man_wearing_turban|ターバンの男性 ターバン 男 男性
👳‍♀️ woman_wearing_turban|ターバンの女性 ターバン 女 女性
👲 person_with_skullcap|中華帽の男性 おわん帽 男 男性 cap chinese gua guapi hat mao pi
🧕 woman_with_headscarf|スカーフの女性 スカーフ ヒジャブ ベール 女 女性 bandana head hijab kerchief mantilla tichel
🤵 person_in_tuxedo|タキシードの人 タキシード フォーマル 人 正装 結婚 formal wedding
🤵‍♂️ man_in_tuxedo|タキシードの男性 タキシード タキシードの男 男 男性 formal groom wedding
🤵‍♀️ woman_in_tuxedo|タキシードの女性 タキシード タキシードの女 女 女性 formal wedding
👰 person_with_veil|ベールの人 ウェディング ベール 人 結婚 顔 wedding
👰‍♂️ man_with_veil|ベールの男性 ベール 男 男性 wedding
👰‍♀️ woman_with_veil|ベールの女性 ベール 女 女性 bride wedding
🤰 pregnant_woman|妊婦 女 女性 妊娠
🫃 pregnant_man|妊夫 妊娠 妊娠した人 男 男性 食べ過ぎ belly bloated full overeat
🫄 pregnant_person|妊娠した人 お腹 妊夫 妊娠 妊婦 食べ過ぎ belly bloated full overeat stuffed
🤱 breast-feeding|授乳 ミルク 女 女性 赤ちゃん baby breast feeding mom mother nursing woman
👩‍🍼 woman_feeding_baby|授乳する女性 ママ 人 女 女性 授乳 新生児 母親 赤ちゃん feed mom mother nanny newborn nursing
👨‍🍼 man_feeding_baby|授乳する男性 パパ 人 授乳 新生児 父親 男 男性 赤ちゃん dad father feed nanny newborn nursing
🧑‍🍼 person_feeding_baby|授乳する人 人 授乳 新生児 母親 父親 赤ちゃん feed nanny newborn nursing parent
👼 baby_angel|天使 エンジェル エンゼル 赤ちゃん天使 顔 church face fairy fairytale fantasy tale
🎅 santa_claus|サンタ クリスマス サンタクロース 顔 celebration christmas fairy fantasy father holiday merry tale xmas
🤶 mrs._claus|女性のサンタ クリスマス サンタクロース 女 女性 celebration christmas fairy fantasy holiday merry mother mrs santa tale xmas
🧑‍🎄 mx_claus|サンタさん クリスマス サンタ サンタクロース 人 帽子 celebration christmas fairy fantasy holiday merry santa tale xmas
🦸 superhero|スーパーヒーロー スーパーマン ヒーロー ヒロイン 善 巨大勢力 超人 good hero superpower
🦸‍♂️ man_superhero|男性のスーパーヒーロー ヒーロー 善 男性 超人 good hero superpower
🦸‍♀️ woman_superhero|女性のスーパーヒーロー ヒーロー ヒロイン 善 女性 超人 good hero heroine superpower
🦹 supervillain|悪役 ヴィラン 人 悪 悪い人 悪人 悪玉 犯人 犯罪者 超悪玉 bad criminal evil superpower villain
🦹‍♂️ man_supervillain|男性の悪役 ヴィラン 悪 犯人 男性 超人 bad criminal evil superpower villain
🦹‍♀️ woman_supervillain|女性の悪役 ヴィラン 女性 悪 犯人 超人 bad criminal evil superpower villain
🧙 mage|魔法使い ファンタジー ロールプレイ 召喚 呪文 魔女 魔法 魔術師 fantasy magic play sorcerer sorceress sorcery spell summon witch wizard
🧙‍♂️ man_mage|男の魔法使い 男 男性 魔法使い fantasy magic play sorcerer sorceress sorcery spell summon witch wizard
🧙‍♀️ woman_mage|女の魔法使い 女 女性 魔女 魔法使い fantasy magic play sorcerer sorceress sorcery spell summon witch wizard
🧚 fairy|妖精 おとぎ話 オベロン パック ファンタジー 伝説 神話 童話 魔法 fairytale fantasy myth person pixie tale wings
🧚‍♂️ man_fairy|男の妖精 妖精 男 男性 fairytale fantasy myth oberon person pixie puck tale wings
🧚‍♀️ woman_fairy|女の妖精 女 女性 妖精 fairytale fantasy myth person pixie tale titania wings
🧛 vampire|吸血鬼 ドラキュラ ハロウィーン バンパイア 不死身 恐怖 歯 牙 血 blood dracula fangs halloween scary supernatural teeth undead
🧛‍♂️ man_vampire|男の吸血鬼 ドラキュラ バンパイア 吸血鬼 男 男性 blood fangs halloween scary supernatural teeth undead
🧛‍♀️ woman_vampire|女の吸血鬼 ドラキュラ バンパイア 吸血鬼 女 女性 blood fangs halloween scary supernatural teeth undead
🧜 merperson|人魚 おとぎ話 サイレン マーメイド 伝説 半魚人 海の生物 海底 creature fairytale folklore ocean sea siren trident
🧜‍♂️ merman|マーマン 人魚 男 男性 creature fairytale folklore neptune ocean poseidon sea siren trident triton
🧜‍♀️ mermaid|マーメイド 人魚 女 女性 creature fairytale folklore merwoman ocean sea siren trident
🧝 elf|エルフ ファンタジー 伝説 妖精 神秘的 神話 魔力 魔法 elves enchantment fantasy folklore magic magical myth
🧝‍♂️ man_elf|男のエルフ エルフ 男 男性 elves enchantment fantasy folklore magic magical myth
🧝‍♀️ woman_elf|女のエルフ エルフ 女 女性 elves enchantment fantasy folklore magic magical myth
🧞 genie|精霊 ジニー ファンタジー ランプをこする 不可思議 神話 魔人 djinn fantasy jinn lamp myth rub wishes
🧞‍♂️ man_genie|男の精霊 男 男性 精霊 魔神 djinn fantasy jinn lamp myth rub wishes
🧞‍♀️ woman_genie|女の精霊 女 女性 精霊 魔神 djinn fantasy jinn lamp myth rub wishes
🧟 zombie|ゾンビ アンデッド ハロウィーン ホラー 大災害 恐怖 歩く屍 apocalypse dead halloween horror scary undead walking
🧟‍♂️ man_zombie|男のゾンビ ゾンビ ホラー 男 男性 apocalypse dead halloween horror scary undead walking
🧟‍♀️ woman_zombie|女のゾンビ ゾンビ ホラー 女 女性 apocalypse dead halloween horror scary undead walking
🧌 troll|トロール おとぎ話 ファンタジー モンスター fairy fantasy monster tale trolling
🫈 hairy_creature|毛むくじゃらの生物 イエティ サスカッチ ビッグフット 巨人 未確認動物 森 毛むくじゃら bigfoot cryptid forest giant sasquatch woodwose yeti
💆 person_getting_massage|フェイスマッサージ中の人 エステ サロン スパ セラピー フェイスマッサージ マッサージ リラックス 施術 癒し face headache relax relaxing salon soothe spa tension therapy treatment
💆‍♂️ man_getting_massage|フェイスマッサージ中の男 エステ フェイスマッサージ マッサージ リラックス 男 男性 顔 face headache relax relaxing salon soothe spa tension therapy treatment
💆‍♀️ woman_getting_massage|フェイスマッサージ中の女 エステ フェイスマッサージ マッサージ 女 女性 face headache relax relaxing salon soothe spa tension therapy treatment
💇 person_getting_haircut|散髪される人 カット ヘアカット 床屋 理容室 理容院 美容室 美容院 髪 barber beauty chop cosmetology cut groom hair parlor shears style
💇‍♂️ man_getting_haircut|散髪される男 カット ヘアカット 床屋 理容室 理容院 男 男性 美容室 美容院 barber beauty chop cosmetology cut groom hair parlor person shears style
💇‍♀️ woman_getting_haircut|散髪される女 ヘアカット 女性 床屋 美容室 美容院 barber beauty chop cosmetology cut groom hair parlor person shears style
🚶 person_walking|歩く人 ウォーキング ハイキング ぶらつく 人 大股 散歩 歩く 歩行 歩行者 amble gait hike man pace pedestrian stride stroll walk
🚶‍♂️ man_walking|歩く男 ウォーキング 歩行 歩行者 男性 amble gait hike pace pedestrian stride stroll walk
🚶‍♀️ woman_walking|歩く女 ウォーキング ハイキング 女性 散歩 歩く 歩行 歩行者 amble gait hike man pace pedestrian stride stroll walk
🚶‍➡️ person_walking_facing_right|歩く人_右向き ウォーキング ハイキング ぶらつく 人 右向き 大股 散歩 歩く 歩行 歩行者 amble gait hike man pace pedestrian stride stroll walk
🚶‍♀️‍➡️ woman_walking_facing_right|歩く女_右向き ウォーキング ハイキング 右向き 女性 散歩 歩く 歩く女 歩行 歩行者 amble gait hike man pace pedestrian stride stroll walk
🚶‍♂️‍➡️ man_walking_facing_right|歩く男_右向き ウォーキング 右向き 歩く男 歩行 歩行者 男性 amble gait hike pace pedestrian stride stroll walk
🧍 person_standing|立つ人 人 立っている 起立 stand
🧍‍♂️ man_standing|立つ男 男性 起立 stand
🧍‍♀️ woman_standing|立つ女 女性 起立 stand
🧎 person_kneeling|正座する人 ひざまずく 人 座る kneel knees
🧎‍♂️ man_kneeling|正座する男性 ひざまずく 座る 男性 kneel knees
🧎‍♀️ woman_kneeling|正座する女性 ひざまずく 女性 座る kneel knees
🧎‍➡️ person_kneeling_facing_right|正座する人_右向き ひざまずく 人 右向き 座る 正座する人 kneel knees
🧎‍♀️‍➡️ woman_kneeling_facing_right|正座する女性_右向き ひざまずく 右向き 女性 座る 正座する女性 kneel knees
🧎‍♂️‍➡️ man_kneeling_facing_right|正座する男性_右向き ひざまずく 右向き 座る 正座する男性 男性 kneel knees
🧑‍🦯 person_with_white_cane|杖をついた人 アクセシビリティ 目 視覚 障がい accessibility blind probing
🧑‍🦯‍➡️ person_with_white_cane_facing_right|杖をついた人_右向き アクセシビリティ 右向き 杖をついた人 目 視覚 障がい accessibility blind probing
👨‍🦯 man_with_white_cane|杖をついた男性 アクセシビリティ 男性 白杖をついた男性 目 視覚 障がい accessibility blind probing
👨‍🦯‍➡️ man_with_white_cane_facing_right|杖をついた男性_右向き アクセシビリティ 右向き 杖をついた男性 男性 白杖をついた男性 目 視覚 障がい accessibility blind probing
👩‍🦯 woman_with_white_cane|杖をついた女性 アクセシビリティ 女性 白杖をついた女性 目 視覚 障がい accessibility blind probing
👩‍🦯‍➡️ woman_with_white_cane_facing_right|杖をついた女性_右向き アクセシビリティ 右向き 女性 杖をついた女性 白杖をついた女性 目 視覚 障がい accessibility blind probing
🧑‍🦼 person_in_motorized_wheelchair|電動車椅子の人 アクセシビリティ 車いす 障がい accessibility
🧑‍🦼‍➡️ person_in_motorized_wheelchair_facing_right|電動車椅子の人_右向き アクセシビリティ 右向き 車いす 障がい 電動車椅子の人 accessibility
👨‍🦼 man_in_motorized_wheelchair|電動車椅子の男性 アクセシビリティ 男性 車いす 障がい accessibility
👨‍🦼‍➡️ man_in_motorized_wheelchair_facing_right|電動車椅子の男性_右向き アクセシビリティ 右向き 男性 車いす 障がい 電動車椅子の男性 accessibility
👩‍🦼 woman_in_motorized_wheelchair|電動車椅子の女性 アクセシビリティ 女性 車いす 障がい accessibility
👩‍🦼‍➡️ woman_in_motorized_wheelchair_facing_right|電動車椅子の女性_右向き アクセシビリティ 右向き 女性 車いす 障がい 電動車椅子の女性 accessibility
🧑‍🦽 person_in_manual_wheelchair|手動式車椅子の人 アクセシビリティ 車いす 障がい accessibility
🧑‍🦽‍➡️ person_in_manual_wheelchair_facing_right|手動式車椅子の人_右向き アクセシビリティ 右向き 手動式車椅子の人 車いす 障がい accessibility
👨‍🦽 man_in_manual_wheelchair|手動式車椅子の男性 アクセシビリティ 男性 車いす 障がい accessibility
👨‍🦽‍➡️ man_in_manual_wheelchair_facing_right|手動式車椅子の男性_右向き アクセシビリティ 右向き 手動式車椅子の男性 男性 車いす 障がい accessibility
👩‍🦽 woman_in_manual_wheelchair|手動式車椅子の女性 アクセシビリティ 女性 車いす 障がい accessibility
👩‍🦽‍➡️ woman_in_manual_wheelchair_facing_right|手動式車椅子の女性_右向き アクセシビリティ 右向き 女性 手動式車椅子の女性 車いす 障がい accessibility
🏃 person_running|走る人 ジョギング マラソン ランナー ランニング 急ぐ 走る 駆け足 fast hurry marathon move quick race racing run rush speed
🏃‍♂️ man_running|走る男 ジョギング マラソン ランナー ランニング 男性 fast hurry marathon move quick race racing run rush speed
🏃‍♀️ woman_running|走る女 ジョギング マラソン ランナー ランニング 女性 急ぐ 走る 駆け足 fast hurry marathon move quick race racing run rush speed
🏃‍➡️ person_running_facing_right|走る人_右向き ジョギング マラソン ランナー ランニング 右向き 急ぐ 走る 走る人 駆け足 fast hurry marathon move quick race racing run rush speed
🏃‍♀️‍➡️ woman_running_facing_right|走る女_右向き ジョギング マラソン ランナー ランニング 右向き 女性 急ぐ 走る 走る女 駆け足 fast hurry marathon move quick race racing run rush speed
🏃‍♂️‍➡️ man_running_facing_right|走る男_右向き ジョギング マラソン ランナー ランニング 右向き 男性 走る男 fast hurry marathon move quick race racing run rush speed
🧑‍🩰 ballet_dancer|バレエダンサー ダンサー バレエ
💃 woman_dancing|踊る女 サルサ タンゴ ダンサー ダンス フラメンコ 女 女性 踊り子 dance dancer elegant festive flair flamenco groove let’s salsa tango
🕺 man_dancing|踊る男 サルサ タンゴ ダンサー ダンス フラメンコ 男 男性 dance dancer elegant festive flair flamenco groove let’s salsa tango
🕴️ person_in_suit_levitating|浮いてるビジネスマン スーツ ビジネスマン 男 男性 空中浮遊 business
👯 people_with_bunny_ears|バニー うさ耳 ずっ友 そっくり ダンサー パーティ ペア 双子 相方 親友 bestie bff counterpart dancer double ear identical pair party partying soulmate twin twinsies
👯‍♂️ men_with_bunny_ears|バニーボーイ うさ耳 ダンサー パーティー 男 男性 親友 bestie bff counterpart dancer double ear identical pair party partying people soulmate twin twinsies
👯‍♀️ women_with_bunny_ears|バニーガール うさ耳 ダンサー パーティー 女 女性 bestie bff counterpart dancer double ear identical pair party partying people soulmate twin twinsies
🧖 person_in_steamy_room|サウナに入る人 くつろぐ サウナ スパ リラックス 蒸しぶろ 蒸気 day luxurious pamper relax sauna spa steam steambath unwind
🧖‍♂️ man_in_steamy_room|サウナに入る男 サウナ 男 男性 day luxurious pamper relax sauna spa steam steambath unwind
🧖‍♀️ woman_in_steamy_room|サウナに入る女 サウナ 女 女性 day luxurious pamper relax sauna spa steam steambath unwind
🧗 person_climbing|山を登る人 ロッククライマー 山 山登り 登る 登山 climb climber mountain rock scale up
🧗‍♂️ man_climbing|山を登る男 山登り 男 男性 登山 climb climber mountain rock scale up
🧗‍♀️ woman_climbing|山を登る女 女 女性 山登り 登山 climb climber mountain rock scale up
🤺 person_fencing|フェンシングをする人 スポーツ フェンシング fencer sword
🏇 horse_racing|競馬 ジョッキー スポーツ 乗馬 競走馬 馬 騎手 jockey racehorse riding sport
⛷️ skier|スキーヤー スキー ストック スポーツ ski snow
🏂 snowboarder|スノーボーダー スノーボード スノボ スポーツ ski snow snowboard sport
🏌️ person_golfing|ゴルフをする人 ゴルフ ゴルファー スポーツ 打ちっぱなし 球技 ball birdie caddy driving golf green pga putt range tee
🏌️‍♂️ man_golfing|ゴルフをする男 ゴルフ ゴルファー スポーツ 男 男性 ball birdie caddy driving golf green pga putt range tee
🏌️‍♀️ woman_golfing|ゴルフをする女 ゴルフ ゴルファー スポーツ 女 女性 球技 ball birdie caddy driving golf green pga putt range tee
🏄 person_surfing|サーフィンする人 サーファー サーフィン スポーツ 波 波乗り 海 beach ocean sport surf surfer swell waves
🏄‍♂️ man_surfing|サーフィンする男 サーファー スポーツ 波乗り 男 男性 beach ocean sport surf surfer swell waves
🏄‍♀️ woman_surfing|サーフィンする女 サーファー スポーツ 女 女性 波乗り beach ocean person sport surf surfer swell waves
🚣 person_rowing_boat|ボートをこぐ人 オール カヌー カヤック スポーツ パドル ボート 手漕ぎボート 漕ぐ 船 canoe cruise fishing lake oar paddle raft river row rowboat
🚣‍♂️ man_rowing_boat|ボートをこぐ男 カヌー カヤック スポーツ 男性 船 canoe cruise fishing lake oar paddle raft river row rowboat
🚣‍♀️ woman_rowing_boat|ボートをこぐ女 カヌー カヤック スポーツ ボート 女 女性 手漕ぎボート 船 canoe cruise fishing lake oar paddle raft river row rowboat
🏊 person_swimming|泳ぐ人 クロール スイマー スイミング スイム スポーツ トライアスロン 水泳 自由形 freestyle sport swim swimmer triathlon
🏊‍♂️ man_swimming|泳ぐ男 スイマー スイミング スイム スポーツ 水泳 男性 freestyle sport swim swimmer triathlon
🏊‍♀️ woman_swimming|泳ぐ女 スイマー スイミング スイム スポーツ 女 女性 水泳 freestyle man sport swim swimmer triathlon
⛹️ person_bouncing_ball|バスケットボールをする人 スポーツ ドリブル バスケ バスケットボール バスケットボール選手 球技 athletic basketball championship dribble net player throw
⛹️‍♂️ man_bouncing_ball|バスケットボールをする男 スポーツ バスケ バスケットボール 球技 男性 athletic basketball championship dribble net player throw
⛹️‍♀️ woman_bouncing_ball|バスケットボールをする女 スポーツ ドリブル バスケ バスケットボール 女性 球技 athletic basketball championship dribble net player throw
🏋️ person_lifting_weights|重量挙げをする人 ウェイトリフティング スポーツ デッドリフト バーベル パワーリフティング ボディビルダー 筋トレ 運動 重量挙げ barbell bodybuilder deadlift lifter powerlifting weight weightlifter workout
🏋️‍♂️ man_lifting_weights|重量挙げをする男 ウェイトリフティング スポーツ 男 男性 barbell bodybuilder deadlift lifter powerlifting weight weightlifter workout
🏋️‍♀️ woman_lifting_weights|重量挙げをする女 ウェイトリフティング スポーツ 女 女性 barbell bodybuilder deadlift lifter powerlifting weight weightlifter workout
🚴 person_biking|自転車に乗る人 サイクリスト サイクリング スポーツ ロードバイク ロードレース 競輪 自転車 自転車乗り bicycle bicyclist bike cycle cyclist riding sport
🚴‍♂️ man_biking|自転車に乗る男 サイクリング スポーツ ロードレース 男性 競輪 bicycle bicyclist bike cycle cyclist riding sport
🚴‍♀️ woman_biking|自転車に乗る女 サイクリスト サイクリング スポーツ ロードレース 女 女性 競輪 自転車 自転車乗り bicycle bicyclist bike cycle cyclist riding sport
🚵 person_mountain_biking|マウンテンバイクに乗る人 サイクリスト サイクリング スポーツ マウンテンバイク 山 競技 自転車 自転車乗り bicycle bicyclist bike cycle cyclist riding sport
🚵‍♂️ man_mountain_biking|マウンテンバイクに乗る男 サイクリング スポーツ 男 男性 自転車 bicycle bicyclist bike cycle cyclist riding sport
🚵‍♀️ woman_mountain_biking|マウンテンバイクに乗る女 サイクリスト サイクリング スポーツ 女 女性 自転車 自転車乗り bicycle bicyclist bike cycle cyclist riding sport
🤸 person_cartwheeling|側転する人 スポーツ トンボ返り 体操 側転 幸せ 活動的 活発 興奮 active cartwheel excited flip gymnastics happy somersault
🤸‍♂️ man_cartwheeling|側転する男 スポーツ トンボ返り 体操 側転 幸せ 活発 男性 興奮 active cartwheel excited flip gymnastics happy somersault
🤸‍♀️ woman_cartwheeling|側転する女 スポーツ トンボ返り 体操 側転 女性 幸せ 活発 興奮 active cartwheel excited flip gymnastics happy somersault
🤼 people_wrestling|レスリングする人 スポーツ デュエル リング内 レスラー レスリング レスリング大会 取っ組み合い 格闘 combat duel grapple ring tournament wrestle
🤼‍♂️ men_wrestling|レスリングする男 スポーツ デュエル リング内 レスリング レスリングをする レスリング大会 取っ組み合い 格闘 男性 combat duel grapple ring tournament wrestle
🤼‍♀️ women_wrestling|レスリングする女 スポーツ デュエル リング内 レスリング レスリングをする レスリング大会 取っ組み合い 女性 格闘 combat duel grapple ring tournament wrestle
🤽 person_playing_water_polo|水球をする人 スポーツ 水上競技 水泳 水球 球技 sport swimming waterpolo
🤽‍♂️ man_playing_water_polo|水球をする男 スポーツ 水上競技 水泳 水球 球技 男性 sport swimming waterpolo
🤽‍♀️ woman_playing_water_polo|水球をする女 スポーツ 女性 水上競技 水泳 水球 球技 sport swimming waterpolo
🤾 person_playing_handball|ハンドボールをする人 アスリート キャッチ スポーツ スローする ハンドボール ボール 投げる 放る 球技 athletics ball catch chuck hurl lob pitch sport throw toss
🤾‍♂️ man_playing_handball|ハンドボールをする男 スポーツ ハンドボール 球技 男 男性 athletics ball catch chuck hurl lob pitch sport throw toss
🤾‍♀️ woman_playing_handball|ハンドボールをする女 キャッチ スポーツ スローする ハンドボール ボール 女性 投げる 放る 球技 athletics ball catch chuck hurl lob pitch sport throw toss
🤹 person_juggling|ジャグリングをする人 ジャグラー ジャグリング ジャグリングする人 バランス演技 マルチタスク 大道芸 操る act balance balancing handle juggle manage multitask skill
🤹‍♂️ man_juggling|ジャグリングをする男 ジャグラー ジャグリング バランス演技 マルチタスク 大道芸 操る 男性 act balance balancing handle juggle manage multitask skill
🤹‍♀️ woman_juggling|ジャグリングをする女 ジャグラー ジャグリング 大道芸 女 女性 act balance balancing handle juggle manage multitask skill
🧘 person_in_lotus_position|ヨガのポーズをする人 くつろぎ ヨガ ヨガ行者 リラックス 平安 瞑想 禅 胡坐 蓮華座のポーズ cross legged legs meditation peace relax serenity yoga yogi zen
🧘‍♂️ man_in_lotus_position|ヨガのポーズをする男 ヨガ 男 男性 瞑想 cross legged legs meditation peace relax serenity yoga yogi zen
🧘‍♀️ woman_in_lotus_position|ヨガのポーズをする女 ヨガ 女 女性 瞑想 cross legged legs meditation peace relax serenity yoga yogi zen
🛀 person_taking_bath|風呂に入る人 バスタブ 浴槽 風呂 bathtub tub
🛌 person_in_bed|ベッドに寝る人 おやすみ グーグー ベッド ホテル 寝る 就寝中 bedtime good goodnight hotel nap night sleep tired zzz
🧑‍🤝‍🧑 people_holding_hands|手をつなぐ2人 カップル つなぐ 人 友達 恋人 手 手をつなぐ bae bestie bff couple dating flirt friends hand hold twins
👭 women_holding_hands|手をつなぐ女性 カップル 友情 友達 同性 女 姉妹 恋人 bae bestie bff couple dating flirt friends girls hand hold sisters twins
👫 woman_and_man_holding_hands|手をつなぐ男女 カップル 友達 女 女性 恋人 男 男女 男性 異性 bae bestie bff couple dating flirt friends hand hold twins
👬 men_holding_hands|手をつなぐ男性 カップル 兄弟 友達 双子 同性 恋人 男 男性 bae bestie bff boys brothers couple dating flirt friends hand hold twins
💏 kiss|2人でキス カップル キス ちゅっ ハート 記念日 anniversary babe bae couple date dating heart love mwah person romance together xoxo
👩‍❤️‍💋‍👨 kiss_woman,_man|2人でキス_女性_男性 2人でキス カップル キス ちゅっ ハート 女性 男性 記念日 anniversary babe bae couple date dating heart love mwah person romance together woman xoxo
👨‍❤️‍💋‍👨 kiss_man,_man|2人でキス_男性_男性 2人でキス カップル キス ちゅっ ハート 男性 記念日 anniversary babe bae couple date dating heart love mwah person romance together xoxo
👩‍❤️‍💋‍👩 kiss_woman,_woman|2人でキス_女性_女性 2人でキス カップル キス ちゅっ ハート 女性 記念日 anniversary babe bae couple date dating heart love mwah person romance together xoxo
💑 couple_with_heart|カップルとハート カップル ハート 恋人 熱々 記念日 anniversary babe bae dating kiss love person relationship romance together you
👩‍❤️‍👨 couple_with_heart_woman,_man|カップルとハート_女性_男性 カップル カップルとハート ハート 女性 恋人 熱々 男性 記念日 anniversary babe bae dating kiss love person relationship romance together woman you
👨‍❤️‍👨 couple_with_heart_man,_man|カップルとハート_男性_男性 カップル カップルとハート ハート 恋人 熱々 男性 記念日 anniversary babe bae dating kiss love person relationship romance together you
👩‍❤️‍👩 couple_with_heart_woman,_woman|カップルとハート_女性_女性 カップル カップルとハート ハート 女性 恋人 熱々 記念日 anniversary babe bae dating kiss love person relationship romance together you
👨‍👩‍👦 family_man,_woman,_boy|家族_男性_女性_男の子 女性 子供 家族 男の子 男性 親子 child man woman
👨‍👩‍👧 family_man,_woman,_girl|家族_男性_女性_女の子 女の子 女性 子供 家族 男性 親子 child man woman
👨‍👩‍👧‍👦 family_man,_woman,_girl,_boy|家族_男性_女性_女の子_男の子 女の子 女性 子供 家族 男の子 男性 親子 child girl man woman
👨‍👩‍👦‍👦 family_man,_woman,_boy,_boy|家族_男性_女性_男の子_男の子 女性 子供 家族 男の子 男性 親子 child man woman
👨‍👩‍👧‍👧 family_man,_woman,_girl,_girl|家族_男性_女性_女の子_女の子 女の子 女性 子供 家族 男性 親子 child man woman
👨‍👨‍👦 family_man,_man,_boy|家族_男性_男性_男の子 子供 家族 男の子 男性 親子 child man
👨‍👨‍👧 family_man,_man,_girl|家族_男性_男性_女の子 女の子 子供 家族 男性 親子 child man
👨‍👨‍👧‍👦 family_man,_man,_girl,_boy|家族_男性_男性_女の子_男の子 女の子 子供 家族 男の子 男性 親子 child girl man
👨‍👨‍👦‍👦 family_man,_man,_boy,_boy|家族_男性_男性_男の子_男の子 子供 家族 男の子 男性 親子 child man
👨‍👨‍👧‍👧 family_man,_man,_girl,_girl|家族_男性_男性_女の子_女の子 女の子 子供 家族 男性 親子 child man
👩‍👩‍👦 family_woman,_woman,_boy|家族_女性_女性_男の子 女性 子供 家族 男の子 親子 child woman
👩‍👩‍👧 family_woman,_woman,_girl|家族_女性_女性_女の子 女の子 女性 子供 家族 親子 child woman
👩‍👩‍👧‍👦 family_woman,_woman,_girl,_boy|家族_女性_女性_女の子_男の子 女の子 女性 子供 家族 男の子 親子 child girl woman
👩‍👩‍👦‍👦 family_woman,_woman,_boy,_boy|家族_女性_女性_男の子_男の子 女性 子供 家族 男の子 親子 child woman
👩‍👩‍👧‍👧 family_woman,_woman,_girl,_girl|家族_女性_女性_女の子_女の子 女の子 女性 子供 家族 親子 child woman
👨‍👦 family_man,_boy|家族_男性_男の子 子供 家族 男の子 男性 親子 child man
👨‍👦‍👦 family_man,_boy,_boy|家族_男性_男の子_男の子 子供 家族 男の子 男性 親子 child man
👨‍👧 family_man,_girl|家族_男性_女の子 女の子 子供 家族 男性 親子 child man
👨‍👧‍👦 family_man,_girl,_boy|家族_男性_女の子_男の子 女の子 子供 家族 男の子 男性 親子 child girl man
👨‍👧‍👧 family_man,_girl,_girl|家族_男性_女の子_女の子 女の子 子供 家族 男性 親子 child man
👩‍👦 family_woman,_boy|家族_女性_男の子 女性 子供 家族 男の子 親子 child woman
👩‍👦‍👦 family_woman,_boy,_boy|家族_女性_男の子_男の子 女性 子供 家族 男の子 親子 child woman
👩‍👧 family_woman,_girl|家族_女性_女の子 女の子 女性 子供 家族 親子 child woman
👩‍👧‍👦 family_woman,_girl,_boy|家族_女性_女の子_男の子 女の子 女性 子供 家族 男の子 親子 child girl woman
👩‍👧‍👧 family_woman,_girl,_girl|家族_女性_女の子_女の子 女の子 女性 子供 家族 親子 child woman
🗣️ speaking_head|話す人のシルエット シルエット 話す 顔 face silhouette speak
👤 bust_in_silhouette|人のシルエット 1人 シルエット 上半身 謎の人 mysterious shadow
👥 busts_in_silhouette|2人のシルエット 2人 シルエット 上半身 友達 bff bust everyone friend friends people
🫂 people_hugging|ハグする人 ありがとう お別れ こんにちは さようなら ハグ 友情 慰め 抱擁 挨拶 comfort embrace farewell friendship goodbye hello hug love thanks
👪 family|家族 子供 親子 child
🧑‍🧑‍🧒 family_adult,_adult,_child|家族_大人二人と子供一人 大人二人 子供一人 家族 親子 adult
🧑‍🧑‍🧒‍🧒 family_adult,_adult,_child,_child|家族_大人二人と子供二人 大人二人 子供二人 家族 親子 adult
🧑‍🧒 family_adult,_child|家族_大人一人と子供一人 大人一人 子供一人 家族 親子 adult
🧑‍🧒‍🧒 family_adult,_child,_child|家族_大人一人と子供二人 大人一人 子供二人 家族 親子 adult
👣 footprints|足あと 裸足 足 barefoot clothing footprint omw print walk
🫆 fingerprint|指紋 セキュリティ 生体認証 鑑識 clue crime detective forensics identity mystery print safety trace
🐵 monkey_face|サルの顔 サル 動物 猿 顔 animal banana
🐒 monkey|サル 動物 猿 animal banana
🦍 gorilla|ゴリラ 動物 顔 animal
🦧 orangutan|オランウータン サル 動物 森の人 猿 animal ape monkey
🐶 dog_face|イヌの顔 イヌ ペット 動物 子犬 犬 顔 adorbs animal pet puppies puppy
🐕 dog|イヌ ペット 動物 犬 animal animals dogs pet
🦮 guide_dog|盲導犬 アクセシビリティ 犬 視覚 補助 補助犬 障がい accessibility animal blind
🐕‍🦺 service_dog|介助犬 アクセシビリティ サービス 犬 補助 accessibility animal assistance
🐩 poodle|プードル ペット 動物 犬 animal dog fluffy
🐺 wolf|オオカミの顔 オオカミ 動物 狼 顔 animal face
🦊 fox|キツネの顔 キツネ 動物 狐 顔 animal face
🦝 raccoon|アライグマ ずる賢い 動物 好奇心 詮索好き animal curious sly
🐱 cat_face|ネコの顔 ネコ ペット 動物 子猫 猫 顔 animal kitten kitty pet
🐈 cat|ネコ ペット 動物 猫 animal animals cats kitten pet
🐈‍⬛ black_cat|黒猫 ネコ 不吉 動物 猫 黒 animal feline halloween meow unlucky
🦁 lion|ライオンの顔 しし座 ライオン 動物 星座 顔 alpha animal face leo mane order rawr roar safari strong zodiac
🐯 tiger_face|トラの顔 トラ 動物 虎 顔 animal big cat predator
🐅 tiger|トラ タイガー 動物 肉食動物 虎 animal big cat predator zoo
🐆 leopard|ヒョウ 動物 肉食動物 animal big cat predator zoo
🐴 horse_face|馬の顔 ウマ 動物 顔 馬 animal dressage equine farm horses
🫎 moose|ヘラジカ エルク ムース 動物 哺乳類 枝角 鹿 alces animal antlers elk mammal
🫏 donkey|ロバ ケッテイ ラバ 動物 哺乳類 馬 animal ass burro hinny mammal mule stubborn
🐎 horse|馬 ウマ ダービー 乗馬 動物 家畜 競走馬 競馬 animal equestrian farm racehorse racing
🦄 unicorn|ユニコーンの顔 ユニコーン 一角獣 動物 顔 face
🦓 zebra|シマウマ しましま ゼブラ 動物 縞 animal stripe
🦌 deer|シカ 動物 顔 鹿 animal
🦬 bison|バイソン バッファロー 動物 牛 群れ 野牛 animal buffalo herd wisent
🐮 cow_face|牛の顔 ウシ 動物 牛 顔 animal farm milk moo
🐂 ox|牡牛 ウシ おうし座 動物 星座 牛 animal animals bull farm taurus zodiac
🐃 water_buffalo|水牛 バッファロー 動物 牛 animal zoo
🐄 cow|牝牛 ウシ 乳牛 動物 家畜 牛 animal animals farm milk moo
🐷 pig_face|ブタの顔 ブタ 動物 豚 顔 animal bacon farm pork
🐖 pig|ブタ ポーク 動物 家畜 豚 animal bacon farm pork sow
🐗 boar|イノシシ 動物 猪 顔 animal pig
🐽 pig_nose|ブタ鼻 ブタ 動物 豚 顔 鼻 animal face farm smell snout
🐏 ram|牡羊 おひつじ座 ヒツジ 動物 星座 羊 animal aries horns male sheep zodiac zoo
🐑 ewe|羊 ウール ヒツジ 動物 家畜 羊毛 animal baa farm female fluffy lamb sheep wool
🐐 goat|山羊 ヤギ やぎ座 動物 家畜 星座 animal capricorn farm milk zodiac
🐪 camel|ラクダ コブ ヒトコブラクダ 動物 砂漠 animal desert dromedary hump one
🐫 two-hump_camel|フタコブラクダ コブ フタコブ ラクダ 動物 砂漠 animal bactrian desert hump two
🦙 llama|ラマ アルパカ ウール グアナコ ビクーナ 動物 羊毛 alpaca animal guanaco vicuña wool
🦒 giraffe|キリン 動物 animal spots
🐘 elephant|ゾウ 動物 象 animal
🦣 mammoth|マンモス 動物 巨大 牙 絶滅 animal extinction large tusk wooly
🦏 rhinoceros|サイ 動物 顔 animal
🦛 hippopotamus|カバ 動物 animal hippo
🐭 mouse_face|ネズミの顔 ねずみ ネズミ 動物 顔 animal
🐁 mouse|ハツカネズミ ねずみ ネズミ マウス 動物 animal animals
🐀 rat|ネズミ ねずみ ラット 動物 animal
🐹 hamster|ハムスターの顔 ネズミ ハムスター ペット 動物 顔 animal face pet
🐰 rabbit_face|ウサギの顔 うさぎ ウサギ ペット 動物 顔 animal bunny pet
🐇 rabbit|ウサギ うさぎ ペット 動物 animal bunny pet
🐿️ chipmunk|リス シマリス りす 動物 animal squirrel
🦫 beaver|ビーバー ダム作り 動物 animal dam teeth
🦔 hedgehog|ハリネズミ とげ はりねずみ ヤマアラシ 動物 animal spiny
🦇 bat|コウモリ こうもり バンパイア 動物 吸血鬼 animal vampire
🐻 bear|クマの顔 くま クマ 動物 熊 顔 animal face grizzly growl honey
🐻‍❄️ polar_bear|シロクマ クマ ホッキョクグマ 動物 北極 白 animal arctic white
🐨 koala|コアラ 動物 顔 animal australia bear down face marsupial under
🐼 panda|パンダの顔 パンダ 動物 顔 animal bamboo face
🦥 sloth|ナマケモノ のんびり ものぐさ 動物 lazy slow
🦦 otter|カワウソ ラッコ 動物 遊び好き 魚を食べる animal fishing playful
🦨 skunk|スカンク 動物 悪臭 animal stink
🦘 kangaroo|カンガルー オーストラリア ジャンプ ジョーイ 動物 有袋類 animal joey jump marsupial
🦡 badger|アナグマ ミツアナグマ ラーテル 動物 animal honey pester
🐾 paw_prints|肉球 動物 犬 猫 足跡 feet paws print
🦃 turkey|七面鳥 ターキー 動物 鳥 bird gobble thanksgiving
🐔 chicken|にわとり ニワトリ 動物 顔 鳥 animal bird ornithology
🐓 rooster|おんどり にわとり ニワトリ 動物 鳥 animal bird ornithology
🐣 hatching_chick|卵からかえったひよこ ひな ひよこ 動物 卵 顔 鳥 animal baby bird egg
🐤 baby_chick|ひよこ ひな 動物 横を向いているひよこ 顔 鳥 animal bird ornithology
🐥 front-facing_baby_chick|前を向いているひよこ ひな ひよこ 動物 鳥 animal bird newborn ornithology
🐦 bird|鳥 動物 顔 animal ornithology
🐧 penguin|ペンギン 動物 顔 鳥 animal antarctica bird ornithology
🕊️ dove|ハト 動物 平和 鳥 鳩 bird fly ornithology peace
🦅 eagle|ワシ イーグル 動物 鳥 animal bird ornithology
🦆 duck|カモ 動物 鳥 animal bird ornithology
🦢 swan|白鳥 ひな みにくいアヒルの子 動物 鳥 animal bird cygnet duckling ornithology ugly
🦉 owl|フクロウ ミミズク 動物 鳥 animal bird ornithology wise
🦤 dodo|ドードー モーリシャス島 絶滅 飛べない鳥 鳥 animal bird extinction large ornithology
🪶 feather|羽 羽根 羽毛 軽い 飛ぶ 鳥 bird flight light plumage
🦩 flamingo|フラミンゴ ピンク色 動物 派手 熱帯 鳥 animal bird flamboyant ornithology tropical
🦚 peacock|クジャク ピーコック 孔雀 派手 鳥 animal bird colorful ornithology ostentatious peahen pretty proud
🦜 parrot|オウム しゃべる 動物 海賊 鳥 animal bird ornithology pirate talk
🪽 wing|翼 天使 天国 神話 空 羽 飛び立つ 飛ぶ 飛行 鳥 angelic ascend aviation bird fly flying heavenly mythology soar
🐦‍⬛ black_bird|黒い鳥 カーカー カラス くちばし コクチョウ ミヤマガラス ワタリガラス 烏 鳥 鳥類 黒 animal beak caw corvid crow ornithology raven rook
🪿 goose|ガチョウ アヒル ガーガー まぬけ 鳥 鳥類 animal bird duck flock fowl gaggle gander geese honk ornithology silly
🐦‍🔥 phoenix|フェニックス ファンタジー 不死鳥 再生 復活 火の鳥 生まれ変わり 神話 転生 輪廻 ascend ascension emerge fantasy firebird glory immortal rebirth reincarnation reinvent renewal revival revive rise transform
🐸 frog|カエルの顔 カエル 動物 顔 animal face
🐊 crocodile|ワニ クロコダイル 動物 爬虫類 animal zoo
🐢 turtle|カメ 亀 動物 爬虫類 animal terrapin tortoise
🦎 lizard|トカゲ ヤモリ 動物 爬虫類 animal reptile
🐍 snake|ヘビ へびつかい座 動物 星座 毒 爬虫類 animal bearer ophiuchus serpent zodiac
🐲 dragon_face|ドラゴンの顔 ドラゴン 動物 竜 顔 龍 animal fairy fairytale tale
🐉 dragon|ドラゴン 動物 竜 龍 animal fairy fairytale knights tale
🦕 sauropod|草食恐竜 ディプロドクス ブラキオサウルス ブロントサウルス 恐竜 竜脚類 brachiosaurus brontosaurus dinosaur diplodocus
🦖 t-rex|ティラノサウルス 恐竜 dinosaur rex t tyrannosaurus
🐳 spouting_whale|潮吹きクジラ クジラ 動物 潮吹き animal beach face ocean
🐋 whale|クジラ 動物 animal beach ocean
🐬 dolphin|イルカ ドルフィン 動物 animal beach flipper ocean
🫍 orca|シャチ クジラ 海 海洋 marine ocean whale
🦭 seal|アザラシ アシカ オットセイ トド 動物 海獣 animal lion ocean sea
🐟 fish|魚 うお座 フィッシング 動物 星座 釣り animal dinner fishes fishing pisces zodiac
🐠 tropical_fish|熱帯魚 動物 魚 animal fishes
🐡 blowfish|フグ 動物 魚 animal fish
🦈 shark|サメ 動物 魚 animal fish
🐙 octopus|タコ オクトパス 動物 軟体動物 animal creature ocean
🐚 spiral_shell|巻き貝 動物 貝 貝殻 animal beach conch sea
🪸 coral|サンゴ 気候変動 海 珊瑚礁 change climate ocean reef sea
🪼 jellyfish|クラゲ プランクトン 刺す 毒 水族館 海 海洋生物 無脊椎動物 触手 針 animal aquarium burn invertebrate jelly life marine ocean ouch plankton sea sting stinger tentacles
🦀 crab|カニ 動物 星座 cancer zodiac
🦞 lobster|ザリガニ シーフード はさみ ビスク レッドロブスター ロブスター 動物 animal bisque claws seafood
🦐 shrimp|エビ シーフード シュリンプ 動物 小エビ food shellfish small
🦑 squid|イカ シーフード 動物 軟体動物 animal food mollusk
🦪 oyster|牡蠣 オイスター カキ シーフード ダイビング 生ガキ 真珠 貝 魚介 diving pearl
🐌 snail|かたつむり エスカルゴ カタツムリ でんでん虫 虫 animal escargot garden nature slug
🦋 butterfly|チョウ バタフライ 昆虫 虫 蝶 insect pretty
🫌 monarch_butterfly|オオカバマダラ 変態 変身 希望 成長 芋虫 虫 蛹から蝶 蝶 caterpillar change fragile hope insect metamorphosis migration transformation
🐛 bug|毛虫 イモムシ 芋虫 虫 animal garden insect
🐜 ant|アリ 昆虫 虫 animal garden insect
🐝 honeybee|ミツバチ ハチ 虫 蜂 animal bee bumblebee honey insect nature spring
🪲 beetle|カブトムシ つの 昆虫 虫 animal bug insect
🐞 lady_beetle|テントウムシ てんとう虫 虫 animal garden insect ladybird ladybug nature
🦗 cricket|バッタ コオロギ 昆虫 直翅目 虫 animal bug grasshopper insect orthoptera
🪳 cockroach|ゴキブリ 害虫 虫 animal insect pest roach
🕷️ spider|クモ スパイダー 虫 animal insect
🕸️ spider_web|クモの巣 ウェブ クモ スパイダー
🦂 scorpion|サソリ さそり座 星座 虫 scorpio scorpius zodiac
🦟 mosquito|蚊 ウイルス マラリア 刺す 熱 病気 虫 bite disease fever insect malaria pest virus
🪰 fly|ハエ 不潔 害虫 病原菌 虫 animal disease insect maggot pest rotting
🪱 worm|ミミズ 寄生虫 虫 animal annelid earthworm parasite
🦠 microbe|微生物 アメーバ ウイルス バクテリア 科学 細菌 amoeba bacteria science virus
💐 bouquet|花束 ブーケ 植物 花 anniversary birthday date flower love plant romance
🌸 cherry_blossom|桜 サクラ 植物 花 開花 flower plant spring springtime
💮 white_flower|大変よくできました はなまる よくできました 花
🪷 lotus|ハスの花 ヒンドゥー教 仏教 極楽 清浄 花 beauty buddhism calm flower hinduism peace purity serenity
🏵️ rosette|花飾り 植物 花 plant
🌹 rose|バラ ローズ 植物 花 薔薇 赤いバラ beauty elegant flower love plant red valentine
🥀 wilted_flower|しおれた花 しおれた 花 dying
🌺 hibiscus|ハイビスカス 植物 花 flower plant
🌻 sunflower|ヒマワリ ひまわり 花 flower outdoors plant sun
🌼 blossom|開花 キンポウゲ 咲いた花 植物 花 buttercup dandelion flower plant
🌷 tulip|チューリップ 植物 花 開花 blossom flower growth plant
🪻 hyacinth|ヒヤシンス スミレ色 ブルーボネット ライラック ラベンダー 植物 紫色 花 青紫 bloom bluebonnet flower indigo lavender lilac lupine plant purple shrub snapdragon spring violet
🌱 seedling|新芽 双葉 芽 plant sapling sprout young
🪴 potted_plant|鉢植え ベランダ 植木鉢 植物 水やり 緑 苗 観葉植物 decor grow house nurturing pot
🌲 evergreen_tree|常緑樹 木 森 christmas forest pine
🌳 deciduous_tree|落葉樹 木 森 forest green habitat shedding
🌴 palm_tree|ヤシの木 ビーチ ヤシ 木 熱帯 beach plant tropical
🌵 cactus|サボテン 植物 砂漠 desert drought nature plant
🌾 sheaf_of_rice|稲 ススキ 稲穂 穀物 米 草 ear grain grains plant
🌿 herb|ハーブ 草 葉 薬草 香草 leaf plant
☘️ shamrock|クローバー 植物 草 葉 irish plant
🍀 four_leaf_clover|四つ葉のクローバー 4 クローバー 植物 草 葉 four-leaf irish lucky plant
🍁 maple_leaf|かえで カエデ もみじ 紅葉 落ち葉 葉 falling
🍂 fallen_leaf|落ち葉 木の葉 枯れ葉 葉 葉っぱ autumn fall falling
🍃 leaf_fluttering_in_wind|風に揺れる葉 木の葉 落ち葉 葉 葉っぱ 風 blow flutter
🪹 empty_nest|空っぽの巣 営巣 巣 巣作り branch home nesting
🪺 nest_with_eggs|鳥の卵と巣 卵 営巣 巣 巣作り 鳥の巣 bird branch egg nesting
🍄 mushroom|キノコ きのこ マッシュルーム 毒 菌類 野菜 fungus toadstool
🪾 leafless_tree|枯れ木 不毛 冬 干ばつ 葉のない木 bare barren branches dead drought trunk winter wood
🍇 grapes|ぶどう グレープ ブドウ 果物 dionysus fruit grape
🍈 melon|メロン マスクメロン 果物 野菜 cantaloupe fruit
🍉 watermelon|スイカ 果物 野菜 fruit
🍊 tangerine|みかん オレンジ ネクタリン ビタミンｃ 果物 柑橘類 c citrus fruit nectarine orange vitamin
🍋 lemon|レモン 果物 柑橘類 酸っぱい citrus fruit sour
🍋‍🟩 lime|ライム さわやか トロピカル フルーツ マルガリータ モヒート 果物 柑橘類 緑 酸っぱい acidity citrus cocktail fruit garnish key margarita mojito refreshing salsa sour tangy tequila tropical zest
🍌 banana|バナナ カリウム 果物 fruit potassium
🍍 pineapple|パイナップル トロピカル パイン 果物 colada fruit pina tropical
🥭 mango|マンゴー トロピカル フルーツ 果物 食べ物 food fruit tropical
🍎 red_apple|赤リンゴ アップル りんご 果物 diet food fruit health ripe
🍏 green_apple|青リンゴ アップル りんご 果物 fruit
🍐 pear|洋ナシ ナシ 果物 西洋ナシ fruit
🍑 peach|桃 ピーチ 果物 fruit
🍒 cherries|さくらんぼ チェリー 果物 berries cherry fruit red
🍓 strawberry|いちご ストロベリー 果物 苺 berry fruit
🫐 blueberries|ブルーベリー ビルベリー ベリー 果物 食べ物 berries berry bilberry blue blueberry food fruit
🥝 kiwi_fruit|キウイフルーツ キウイ 果物 food
🍅 tomato|トマト 果物 野菜 food fruit vegetable
🫒 olive|オリーブ 実 果実 食べ物 food
🥥 coconut|ココナツ ココナッツ ヤシの実 果物 colada palm piña
🥑 avocado|アボカド 果物 野菜 food fruit
🍆 eggplant|ナス 野菜 aubergine vegetable
🥔 potato|ジャガイモ イモ じゃがいも ポテト 野菜 food vegetable
🥕 carrot|人参 ニンジン 野菜 food vegetable
🌽 ear_of_corn|とうもろこし コーン トウモロコシ 野菜 crops farm maize maze
🌶️ hot_pepper|とうがらし 辛い 野菜 香辛料
🫑 bell_pepper|ピーマン とうがらし パプリカ 野菜 青ピーマン capsicum food vegetable
🥒 cucumber|キュウリ ピクルス 漬け物 野菜 food pickle vegetable
🫝 pickle|ピクルス キュウリ レリッシュ 付け合わせ 漬物 発酵 胡瓜 酢漬け brine condiment cucumber ferment gherkin relish trouble
🥬 leafy_green|葉野菜 キャベツ ケール サラダ チンゲン菜 レタス bok burgers cabbage choy kale lettuce salad
🥦 broccoli|ブロッコリー 野菜 cabbage wild
🧄 garlic|ニンニク ガーリック におい 薬味 野菜 香り flavoring
🧅 onion|タマネギ ねぎ 玉ねぎ 薬味 野菜 flavoring
🥜 peanuts|ピーナッツ ナッツ 落花生 野菜 food nut peanut vegetable
🫘 beans|豆 キドニービーンズ ビーンズ レッドキドニー 小豆 赤インゲン豆 金時豆 食べ物 food kidney legume small
🌰 chestnut|くり 栗 野菜 almond plant
🫚 ginger_root|ショウガ ジンジャー スパイス ハーブ 生姜 薬味 薬草 beer health herb natural spice
🫛 pea_pod|エンドウ豆 グリーンピース さや 大豆 枝豆 豆 野菜 beans beanstalk edamame legume soybean vegetable veggie
🍄‍🟫 brown_mushroom|きのこ キノコ しいたけ トリュフ ブラウンマッシュルーム ポートベロー マッシュルーム 椎茸 茸 菌類 food fungi fungus nature pizza portobello shiitake shroom spore sprout toppings truffle vegetable vegetarian veggie
🫜 root_vegetable|根菜 カブ ビーツ 庭 根 野菜 beet food garden radish salad turnip vegetarian
🍞 bread|食パン パン ベーカリー 小麦 carbs food grain loaf restaurant toast wheat
🥐 croissant|クロワッサン パン フランス ベーカリー bread breakfast crescent food french roll
🥖 baguette_bread|バゲット パン フランスパン ベーカリー food french
🫓 flatbread|フラットブレッド アレパ ナン パン ピタパン ラバシ 食べ物 arepa bread food gordita lavash naan pita
🥨 pretzel|プレッツェル ねじり パン convoluted twisted
🥯 bagel|ベーグル クリームチーズ パン パン屋 ベーカリー 朝食 bakery bread breakfast schmear
🥞 pancakes|パンケーキ ホットケーキ breakfast crêpe food hotcake pancake
🧇 waffle|ワッフル ふんわり 朝食 焼き菓子 breakfast indecisive iron
🧀 cheese_wedge|チーズ
🍖 meat_on_bone|骨付き肉 もも肉 肉 骨
🍗 poultry_leg|鶏もも肉 チキン もも肉 肉 骨 骨付き肉 bone chicken drumstick hungry turkey
🥩 cut_of_meat|ステーキ肉 ステーキ ビーフ ポーク ラム 肉 赤身肉 chop lambchop porkchop red steak
🥓 bacon|ベーコン 肉 breakfast food meat
🍔 hamburger|ハンバーガー バーガー ファストフード burger eat fast food hungry
🍟 french_fries|フライドポテト ファストフード フレンチフライ ポテト ポテトフライ fast food
🍕 pizza|ピザ チーズ ピッツァ ペパロニ cheese food hungry pepperoni slice
🌭 hot_dog|ホットドッグ ソーセージ フランクフルト frankfurter hotdog sausage
🥪 sandwich|サンドイッチ パン bread
🌮 taco|タコス メキシカン メキシコ料理 mexican
🌯 burrito|ブリトー ソフトタコス メキシカン メキシコ料理 ラップサンド mexican wrap
🫔 tamale|タマル タマレス ちまき パモーニャ メキシカン 食べ物 food mexican pamonha wrapped
🥙 stuffed_flatbread|ケバブサンド ケバブ ピタパン ラップサンド falafel food gyro kebab
🧆 falafel|ファラフェル コロッケ ヒヨコマメ 肉団子 chickpea meatball
🥚 egg|卵 breakfast food
🍳 cooking|料理 フライパン レストラン 卵 朝食 目玉焼き breakfast easy egg fry frying over pan restaurant side sunny up
🥘 shallow_pan_of_food|パエリア シーフード パエリア鍋 casserole paella
🍲 pot_of_food|なべ シチュー スープ 煮物 煮込み soup stew
🫕 fondue|フォンデュ スイス チーズ チーズフォンデュ チョコ 溶かす 鍋 食べ物 cheese chocolate food melted pot ski
🥣 bowl_with_spoon|ボウルとスプーン オートミール おかゆ シリアル 朝食 粥 breakfast cereal congee oatmeal porridge
🥗 green_salad|グリーンサラダ グリーン サラダ food
🍿 popcorn|ポップコーン お菓子 corn movie pop
🧈 butter|バター 乳製品 dairy
🧂 salt|塩 しょっぱい 振りかけ容器 薬味 調味料 condiment flavor mad salty shaker taste upset
🥫 canned_food|缶詰 缶 非常食 can
🍱 bento_box|弁当 幕の内 弁当箱 駅弁 food
🍘 rice_cracker|せんべい お菓子 food
🍙 rice_ball|おにぎり おむすび 和食 米 food japanese
🍚 cooked_rice|ごはん ライス 米 food
🍛 curry_rice|カレーライス カレー ライス food
🍜 steaming_bowl|ラーメン スープ どんぶり ヌードル 熱々 箸 麺 chopsticks food noodle pho ramen soup
🍝 spaghetti|スパゲッティ イタリア料理 スパゲッティー スパゲティ パスタ ミートソース food meatballs pasta restaurant
🍠 roasted_sweet_potato|焼き芋 サツマイモ 芋 food
🍢 oden|おでん 串 練り物 food kebab restaurant seafood skewer stick
🍣 sushi|すし お寿司 寿司 food
🍤 fried_shrimp|エビフライ エビ エビ天 フライ 天ぷら prawn tempura
🍥 fish_cake_with_swirl|なると 渦巻き 練り物 food pastry restaurant
🥮 moon_cake|月餅 お祝い 中秋節 中華菓子 秋 autumn festival yuèbǐng
🍡 dango|だんご お団子 デザート 串 和菓子 dessert japanese skewer stick sweet
🥟 dumpling|点心 ギョーザ ぎょうざ 肉まん 餃子 empanada gyōza jiaozi pierogi potsticker
🥠 fortune_cookie|フォーチュンクッキー おみくじ prophecy
🥡 takeout_box|テイクアウト弁当 デリバリー 中華 弁当 持ち帰り 箸 chopsticks delivery food oyster pail
🍦 soft_ice_cream|ソフトクリーム アイス スイーツ ソフト デザート dessert food icecream restaurant serve sweet
🍧 shaved_ice|かき氷 アイス シェイブアイス スイーツ デザート 氷 dessert restaurant sweet
🍨 ice_cream|アイスクリーム アイス スイーツ デザート dessert food restaurant sweet
🍩 doughnut|ドーナツ お菓子 スイーツ デザート breakfast dessert donut food sweet
🍪 cookie|クッキー お菓子 スイーツ チョコレートチップ デザート chip chocolate dessert sweet
🎂 birthday_cake|バースデーケーキ お祝い お菓子 ケーキ スイーツ バースデー ハッピーバースデー 誕生日 bday celebration dessert happy pastry sweet
🍰 shortcake|ショートケーキ お菓子 ケーキ スイーツ デザート cake dessert pastry slice sweet
🧁 cupcake|カップケーキ おやつ お菓子 ケーキ スイーツ ベーカリー 砂糖 bakery dessert sprinkles sugar sweet treat
🥧 pie|パイ アップルパイ お菓子 タルト パンプキンパイ ミートパイ apple filling fruit meat pastry pumpkin slice
🍫 chocolate_bar|チョコレート お菓子 スイーツ チョコ デザート 板チョコ candy dessert halloween sweet tooth
🍬 candy|キャンディ あめ お菓子 虫歯 cavities dessert halloween restaurant sweet tooth wrapper
🍭 lollipop|ぺろぺろキャンディ あめ お菓子 キャンディ 棒付きキャンディ candy dessert food restaurant sweet
🍮 custard|プリン お菓子 カスタード スイーツ デザート dessert pudding sweet
🍯 honey_pot|はちみつ ハチミツ ハニー プーさん 壺 甘い barrel bear food honeypot jar sweet
🍼 baby_bottle|ほにゅう瓶 ミルク 哺乳瓶 新生児 赤ちゃん babies birth born drink infant milk newborn
🥛 glass_of_milk|牛乳入りのコップ グラス コップ ミルク 牛乳 drink
☕ hot_beverage|温かい飲み物 カフェ カフェイン コーヒー ホットドリンク 紅茶 飲み物 cafe caffeine chai coffee drink morning steaming tea
🫖 teapot|ティーポット お茶 急須 茶器 飲み物 brew drink food pot tea
🍵 teacup_without_handle|湯飲み お茶 緑茶 茶碗 飲み物 beverage cup drink oolong tea
🍶 sake|徳利 日本酒 猪口 酒 bar beverage bottle cup drink restaurant
🍾 bottle_with_popping_cork|シャンパン コルク シャンペン スパークリングワイン スプマンテ バー ボトル 泡 飲み物 bar drink
🍷 wine_glass|ワイングラス アルコール お酒 グラス バー ワイン alcohol bar beverage booze club drink drinking drinks restaurant
🍸 cocktail_glass|カクテルグラス アルコール お酒 カクテル グラス クラブ バー マティーニ alcohol bar booze club drink drinking drinks mad martini men
🍹 tropical_drink|トロピカルドリンク アルコール お酒 カクテル トロピカル バー マイタイ alcohol bar booze club cocktail drinking drinks drunk mai party tai tropics
🍺 beer_mug|ビールジョッキ アルコール オクトーバーフェスト お酒 ジョッキ バー ビール 居酒屋 alcohol ale bar booze drink drinking drinks octoberfest oktoberfest pint stein summer
🍻 clinking_beer_mugs|ビールで乾杯 アルコール ジョッキ バー ビール 乾杯 宴会 alcohol bar booze bottoms cheers clink drinking drinks
🥂 clinking_glasses|グラスで乾杯 グラス シャンパン シャンペン スパークリングワイン スプマンテ 乾杯 祝杯 celebrate clink drink glass
🥃 tumbler_glass|タンブラーグラス ウィスキー ウイスキー グラス ショット スコッチ タンブラー liquor scotch shot whiskey whisky
🫗 pouring_liquid|コップから注ぐ ガラス こぼす 水 液体 飲み物 accident drink empty glass oops pour spill water
🥤 cup_with_straw|ストローカップ コップ ジュース ソーダ ソフトドリンク 水 drink juice malt soda soft water
🧋 bubble_tea|タピオカドリンク お茶 タピオカ ドリンク バブルティー ミルクティー 飲み物 boba food milk pearl
🧃 beverage_box|紙パック飲料 ジュース ストロー ドリンク 飲み物 juice straw sweet
🧉 mate|マテ茶 お茶 ドリンク 飲み物 drink
🧊 ice|角氷 冷たい 氷 氷山 cold cube iceberg
🥢 chopsticks|はし おはし 箸 hashi jeotgarak kuaizi
🍽️ fork_and_knife_with_plate|ナイフとフォークと皿 お皿 ディナー ナイフ フォーク 皿 食器 cooking dinner eat
🍴 fork_and_knife|ナイフとフォーク カトラリー ごちそう ディナー ナイフ フォーク レストラン 朝食 食事 食器 breakfast breaky cooking cutlery delicious dinner eat feed food hungry lunch restaurant yum yummy
🥄 spoon|スプーン カトラリー 食器 eat tableware
🔪 kitchen_knife|包丁 ナイフ 凶器 料理 調理器具 chef cooking hocho tool weapon
🫙 jar|瓶 ジャー びん 保存 容器 空 空き瓶 調味料 condiment container empty nothing sauce store
🏺 amphora|壺 かめ 星座 水瓶 aquarius cooking drink jug tool weapon zodiac
🌍 globe_showing_europe-africa|地球（ヨーロッパとアフリカ） アフリカ ヨーロッパ 世界 地球 africa earth europe world
🌎 globe_showing_americas|地球（アメリカ大陸） アメリカ アメリカ大陸 世界 地球 earth world
🌏 globe_showing_asia-australia|地球（アジアとオーストラリア） アジア オーストラリア 世界 地球 asia australia earth world
🌐 globe_with_meridians|子午線のある地球 インターネット 地球 子午線 earth internet web world worldwide
🗺️ world_map|世界地図 マップ 世界 地図
🗾 map_of_japan|日本地図 地図 日本
🧭 compass|コンパス オリエンテーリング 方位磁針 方角 磁石 航海 航空 direction magnetic navigation orienteering
🏔️ snow-capped_mountain|雪山 冠雪 山 雪 cold snow
⛰️ mountain|山 山岳
🛘 landslide|地滑り 土砂災害 山 山崩れ 岩石 崩落 災害 落石 avalanche danger disaster earthquake mountain mudslide rocks
🌋 volcano|火山 噴火 山 溶岩 eruption mountain nature
🗻 mount_fuji|富士山 山 mountain nature
🏕️ camping|キャンプ テント 山
🏖️ beach_with_umbrella|ビーチパラソル パラソル ビーチ 砂浜
🏜️ desert|砂漠 サボテン サボテンのある砂漠
🏝️ desert_island|無人島 ヤシ ヤシの木のある島 島
🏞️ national_park|国立公園 公園 自然
🏟️ stadium|競技場 スタジアム 野球場
🏛️ classical_building|歴史的な建物 古代 史跡 歴史 歴史的建造物
🏗️ building_construction|建設中 クレーン 工事 建築 建設 crane
🧱 brick|れんが しっくい ブロック モルタル 壁 煉瓦 粘土 bricks clay mortar wall
🪨 rock|岩石 岩 巨岩 石 石材 硬い 重たい boulder heavy solid stone tough
🪵 wood|丸太 ログ 切り株 木 木材 材木 樹木 log lumber timber
🛖 hut|わらぶき小屋 バンガロー ユルト 家 小屋 home house roundhouse shelter yurt
🏘️ houses|住宅街 家 街 複数の家 house
🏚️ derelict_house|廃屋 家 建物 空き家 home
🏠 house|家 マイホーム 一戸建て 建物 郊外 building country heart home ranch settle simple suburban suburbia where
🏡 house_with_garden|庭付きの家 マイホーム 一戸建て 家 庭 建物 郊外 building country heart home ranch settle simple suburban suburbia where
🏢 office_building|オフィスビル 会社 建物 社屋 都会 city cubical job
🏣 japanese_post_office|郵便局 建物 郵便 building
🏤 post_office|西洋の郵便局 建物 郵便 building european
🏥 hospital|病院 医者 建物 薬 building doctor medicine
🏦 bank|銀行 建物 building
🏨 hotel|ホテル 建物 building
🏩 love_hotel|ラブホテル ホテル ラブホ 建物 building
🏪 convenience_store|コンビニ 24時間営業 コンビニエンスストア 店 建物 24 building hours
🏫 school|学校 建物 校舎 building
🏬 department_store|デパート ビル 店舗 建物 百貨店 building
🏭 factory|工場 ファクトリー 建物 煙突 building
🏯 japanese_castle|城 建物 日本 日本の城 building
🏰 castle|西洋の城 キャッスル 城 建物 building european
💒 wedding|結婚式 チャペル ロマンス 建物 式場 教会 礼拝堂 結婚 chapel hitched nuptials romance
🗼 tokyo_tower|東京タワー タワー 塔 東京
🗽 statue_of_liberty|自由の女神 アメリカ ニューヨーク 彫像 new ny nyc york
⛪ church|教会 キリスト教 チャペル 十字架 宗教 建物 礼拝堂 bless chapel christian cross religion
🕌 mosque|モスク イスラム教 宗教 建物 islam masjid muslim religion
🛕 hindu_temple|ヒンドゥー教の寺院 ヒンズー教 宗教 寺 建物
🕍 synagogue|シナゴーグ ユダヤ教 宗教 建物 jew jewish judaism religion temple
⛩️ shinto_shrine|鳥居 宗教 建物 神社 神道 religion
🕋 kaaba|カーバ イスラム教 メッカ 宗教 建物 聖地 巡礼 hajj islam muslim religion umrah
⛲ fountain|噴水
⛺ tent|テント キャンプ camping
🌁 foggy|霧の都会 もや 都会 霧 fog
🌃 night_with_stars|夜の都会 夜 夜景 星 星空 star
🏙️ cityscape|高層ビル ビル群 都会 都市 city
🌄 sunrise_over_mountains|山から日の出 ご来光 太陽 日の出 朝 朝日 morning sun
🌅 sunrise|日の出 太陽 日光 朝 朝日 morning nature sun
🌆 cityscape_at_dusk|夕暮れの都会 ビル 夕方 夕日 夕暮れ 都会 都市 building city evening landscape sun sunset
🌇 sunset|夕日 ビル 夕方 夕暮れ 太陽 日暮れ 日没 building dusk sun
🌉 bridge_at_night|夜の橋 夜 夜景 橋
♨️ hot_springs|温泉マーク 温泉 湯気 hotsprings steaming
🎠 carousel_horse|メリーゴーランド メリーゴーラウンド 回転木馬 遊園地 馬 entertainment
🛝 playground_slide|すべり台 公園 遊具 amusement park play playing sliding theme
🎡 ferris_wheel|観覧車 アミューズメントパーク 遊園地 amusement park theme
🎢 roller_coaster|ジェットコースター アミューズメントパーク 遊園地 amusement park theme
💈 barber_pole|床屋 バーバー ヘアサロン 理容室 理容院 理髪店 美容室 美容院 cut fresh haircut shave
🎪 circus_tent|サーカス サーカス小屋 テント
🚂 locomotive|蒸気機関車 sl 乗り物 列車 機関車 汽車 鉄道 caboose engine railway steam train trains travel
🚃 railway_car|電車 トロリーバス 乗り物 列車 鉄道 electric train tram travel trolleybus
🚄 high-speed_train|新幹線 乗り物 鉄道 電車 高速列車 railway shinkansen speed
🚅 bullet_train|0系新幹線 0系 丸い新幹線 乗り物 新幹線 鉄道 電車 高速列車 high-speed nose railway shinkansen speed travel
🚆 train|電車正面 乗り物 列車 電車 arrived choo railway
🚇 metro|地下鉄 メトロ 乗り物 電車 subway travel
🚈 light_rail|ライトレール モノレール 乗り物 鉄道 電車 arrived monorail railway
🚉 station|駅 ステーション 乗り物 列車 電車 railway train
🚊 tram|路面電車正面 乗り物 路面電車 電車 trolleybus
🚝 monorail|モノレール 乗り物 電車 vehicle
🚞 mountain_railway|登山鉄道 乗り物 登山電車 電車 car trip
🚋 tram_car|路面電車 トロリーバス 乗り物 電車 bus trolley trolleybus
🚌 bus|バス スクールバス 乗り物 車 school vehicle
🚍 oncoming_bus|バス正面 バス 乗り物 車 cars
🚎 trolleybus|トロリーバス バス 乗り物 路面電車 bus tram trolley
🚐 minibus|マイクロバス バス ミニバス 乗り物 小型バス 車 bus drive van vehicle
🚑 ambulance|救急車 乗り物 車 emergency vehicle
🚒 fire_engine|消防車 乗り物 車 truck
🚓 police_car|パトカー パトロール 乗り物 警察 5–0 cops patrol
🚔 oncoming_police_car|パトカー正面 パトカー 乗り物 警察
🚕 taxi|タクシー イエローキャブ 乗り物 車 cab cabbie car drive vehicle yellow
🚖 oncoming_taxi|タクシー正面 イエローキャブ タクシー 乗り物 車 cab cabbie cars drove hail yellow
🚗 automobile|自動車 ドライブ 乗り物 乗用車 車 car driving vehicle
🚘 oncoming_automobile|自動車正面 ドライブ 乗り物 乗用車 自動車 車 car cars drove vehicle
🚙 sport_utility_vehicle|アールブイ車 rv車 suv車 乗り物 乗用車 自動車 車 car drive recreational sportutility
🛻 pickup_truck|軽トラック トラック ピックアップトラック 乗り物 自動車 車 配達 automobile car flatbed pick-up transportation
🚚 delivery_truck|トラック 乗り物 車 配送 配達 car drive vehicle
🚛 articulated_lorry|トレーラー トラック 乗り物 車 car drive move semi truck vehicle
🚜 tractor|トラクター 乗り物 車 vehicle
🏎️ racing_car|レーシングカー f1 カーレース スポーツ モータースポーツ レース 乗り物 車 zoom
🏍️ motorcycle|オートバイ オートレース スポーツ バイク モータースポーツ 乗り物 racing
🛵 motor_scooter|スクーター オートバイ バイク 原付
🦽 manual_wheelchair|手動式車椅子 アクセシビリティ 椅子 車椅子 accessibility
🦼 motorized_wheelchair|電動車椅子 アクセシビリティ 椅子 車椅子 accessibility
🛺 auto_rickshaw|三輪タクシー オートリクシャー タクシー トゥクトゥク リクシャー tuk
🚲 bicycle|自転車 サイクリング 乗り物 bike class cycle cycling cyclist gang ride spin spinning
🛴 kick_scooter|キックボード キックスクーター キックスケーター
🛹 skateboard|スケートボード スケボー ボード board skate skater wheels
🛼 roller_skate|ローラースケート スケート スポーツ blades skates sport
🚏 bus_stop|バス停 バス乗り場 乗り物 停留所 busstop
🛣️ motorway|高速道路 ハイウェイ 道路 高速 highway road
🛤️ railway_track|線路 軌道 鉄道 train
🛢️ oil_drum|ドラム缶 オイル 石油
⛽ fuel_pump|ガソリンスタンド ガソリン ガソリンノズル 給油 diesel fuelpump gas gasoline station
🛞 wheel|ホイール スポーク タイヤ 自動車 車 車輪 car circle tire turn vehicle
🚨 police_car_light|パトランプ サイレン パトカー 緊急 警察 赤色灯 alarm alert beacon emergency revolving siren
🚥 horizontal_traffic_light|信号横 交差点 交通 信号 信号機 intersection signal stop stoplight
🚦 vertical_traffic_light|信号縦 交差点 交通 信号 信号機 drove intersection signal stop stoplight
🛑 stop_sign|止まれの標識 ストップ 八角形 標識 止まれ octagonal
🚧 construction|工事中 サイン 通行止め barrier
🛙 lighthouse|灯台 ビーコン 信号 光 導き 希望 海 灯り 航海 船 beacon enlightenment guidance hope light maritime navigation sea signal
⚓ anchor|錨 いかり 碇 船 ship tool
🛟 ring_buoy|救命浮環 ブイ ライフセーバー レスキュー 安全 救助 救命具 浮き輪 float life lifesaver preserver rescue safety save saver swim
⛵ sailboat|ヨット セーリング 乗り物 帆船 船 boat resort sailing sea yacht
🛶 canoe|カヌー カヤック ボート 乗り物 船 boat
🚤 speedboat|スピードボート ボート モーターボート 乗り物 快速艇 船 billionaire boat lake luxury millionaire summer travel
🛳️ passenger_ship|客船 乗り物 旅客船 船
⛴️ ferry|フェリー 乗り物 客船 船 boat passenger
🛥️ motor_boat|モーターボート ボート 乗り物 船 motorboat
🚢 ship|船 タイタニック号 乗り物 客船 boat passenger travel
✈️ airplane|飛行機 ジェット機 乗り物 旅行 航空機 aeroplane fly flying jet plane travel
🛩️ small_airplane|小型飛行機 乗り物 小型機 航空機 飛行機 aeroplane plane
🛫 airplane_departure|飛行機離陸 乗り物 航空機 離陸 飛行機 aeroplane check-in departures plane
🛬 airplane_arrival|飛行機着陸 乗り物 着陸 航空機 飛行機 aeroplane arrivals arriving landing plane
🪂 parachute|パラシュート スカイダイビング パラグライダー パラセーリング ハンググライダー hang-glide parasail skydive
💺 seat|座席 シート 席 椅子 chair
🚁 helicopter|ヘリコプター ヘリ 乗り物 copter roflcopter travel vehicle
🚟 suspension_railway|懸垂式モノレール モノレール 乗り物 電車
🚠 mountain_cableway|ケーブルカー ゴンドラ リフト 乗り物 cable gondola lift ski
🚡 aerial_tramway|ロープウェイ ゴンドラ 乗り物 cable car gondola ropeway
🛰️ satellite|人工衛星 宇宙 space
🚀 rocket|ロケット 乗り物 宇宙 宇宙旅行 発射 launch rockets space travel
🛸 flying_saucer|空飛ぶ円盤 ufo 乗り物 宇宙 宇宙人 未確認飛行物体 aliens extra terrestrial
🛎️ bellhop_bell|ベルボーイベル ベル ホテル hotel
🧳 luggage|スーツケース キャリーケース パッキング 旅行 旅行かばん bag packing roller suitcase travel
⌛ hourglass_done|砂時計 タイマー 時計 砂 sand time timer
⏳ hourglass_not_done|砂が落ちている砂時計 タイマー 時計 時間 砂 砂時計 flowing hours sand timer waiting yolo
⌚ watch|腕時計 ウォッチ 時計 時間 clock time
⏰ alarm_clock|目覚まし時計 アラーム 時計 時間 目覚まし hours hrs late time waiting
⏱️ stopwatch|ストップウォッチ タイム 時計 clock time
⏲️ timer_clock|タイマー 時計
🕰️ mantelpiece_clock|置時計 マンテルクロック 時計 時間 置き時計 time
🕛 twelve_o’clock|12時 12_00 時計 正午 零時 12 clock time
🕧 twelve-thirty|12時半 12_30 12時30分 時計 12 30 clock thirty time twelve
🕐 one_o’clock|1時 1_00 時計 1 clock time
🕜 one-thirty|1時半 1_30 1時30分 時計 1 30 clock one thirty time
🕑 two_o’clock|2時 2_00 時計 2 clock time
🕝 two-thirty|2時半 2_30 2時30分 時計 2 30 clock thirty time two
🕒 three_o’clock|3時 3_00 時計 3 clock time
🕞 three-thirty|3時半 3_30 3時30分 時計 3 30 clock thirty three time
🕓 four_o’clock|4時 4_00 時計 4 clock time
🕟 four-thirty|4時半 4_30 4時30分 時計 30 4 clock four thirty time
🕔 five_o’clock|5時 5_00 時計 5 clock time
🕠 five-thirty|5時半 5_30 5時30分 時計 30 5 clock five thirty time
🕕 six_o’clock|6時 6_00 時計 6 clock time
🕡 six-thirty|6時半 6_30 6時30分 時計 30 6 clock six thirty
🕖 seven_o’clock|7時 7_00 時計 0 7 clock
🕢 seven-thirty|7時半 7_30 7時30分 時計 30 7 clock seven thirty
🕗 eight_o’clock|8時 8_00 時計 8 clock time
🕣 eight-thirty|8時半 8_30 8時30分 時計 30 8 clock eight thirty time
🕘 nine_o’clock|9時 9_00 時計 9 clock time
🕤 nine-thirty|9時半 9_30 9時30分 時計 30 9 clock nine thirty time
🕙 ten_o’clock|10時 10_00 時計 0 10 clock
🕥 ten-thirty|10時半 10_30 10時30分 時計 10 30 clock ten thirty time
🕚 eleven_o’clock|11時 11_00 時計 11 clock time
🕦 eleven-thirty|11時半 11_30 11時30分 時計 11 30 clock eleven thirty time
🌑 new_moon|新月 宇宙 月 闇 dark space
🌒 waxing_crescent_moon|初月 三日月 宇宙 月 dreams space
🌓 first_quarter_moon|上弦の月 上弦 半月 宇宙 月 space
🌔 waxing_gibbous_moon|十三夜月 十日夜の月 宇宙 月 space
🌕 full_moon|満月 宇宙 月 space
🌖 waning_gibbous_moon|寝待月 宇宙 居待月 月 space
🌗 last_quarter_moon|下弦の月 下弦 半月 宇宙 月 space
🌘 waning_crescent_moon|有明月 三日月 宇宙 月 space
🌙 crescent_moon|三日月 宇宙 月 ramadan space
🌚 new_moon_face|顔のある新月 新月 月 顔 space
🌛 first_quarter_moon_face|顔のある上弦の月 上弦の月 半月 月 顔 space
🌜 last_quarter_moon_face|顔のある下弦の月 下弦の月 半月 月 顔 dreams
🌡️ thermometer|温度計 天気 寒暖計 気温 温度 weather
☀️ sun|太陽 天気 日光 晴れ bright rays space sunny weather
🌝 full_moon_face|顔のある満月 月 満月 顔 bright
🌞 sun_with_face|顔のある太陽 太陽 顔 beach bright day heat shine sunny sunshine weather
🪐 ringed_planet|環のある惑星 リング 土星 天体 惑星 星 saturn saturnine
⭐ star|スター 天文学 星 astronomy medium stars white
🌟 glowing_star|きらきら星 きらきら キラキラ スター 星 輝き glittery glow night shining sparkle win
🌠 shooting_star|流れ星 スター 夜 宇宙 星 falling night space
🌌 milky_way|天の川 ミルキーウェイ 夜空 宇宙 星空 銀河 space
☁️ cloud|雲 天気 曇り weather
⛅ sun_behind_cloud|曇り時々晴れ 天気 太陽 曇り 雲 cloudy weather
⛈️ cloud_with_lightning_and_rain|雷雨 天気 稲妻 雨 雲 雷 雷雲 thunder thunderstorm
🌤️ sun_behind_small_cloud|晴れ時々曇り 天気 太陽 晴れ 雲 weather
🌥️ sun_behind_large_cloud|曇り一時晴れ 天気 太陽 曇り 雲 weather
🌦️ sun_behind_rain_cloud|雨時々晴れ 天気 天気雨 太陽 曇り 雲 weather
🌧️ cloud_with_rain|雨雲 天気 雨 雲 weather
🌨️ cloud_with_snow|雪雲 天気 雪 雲 cold weather
🌩️ cloud_with_lightning|雷雲 天気 稲妻 雲 雷 weather
🌪️ tornado|竜巻 トルネード 天気 突風 cloud weather whirlwind
🌫️ fog|霧 天気 曇り 雲 cloud weather
🌬️ wind_face|顔のある風 雲 顔 風 blow cloud
🌀 cyclone|渦巻き サイクロン ハリケーン めまい もやもや 台風 天気 dizzy hurricane twister typhoon weather
🌈 rainbow|虹 glbt glbtq lgbt lgbtq ゲイ トランスジェンダー バイセクシュアル レインボー レズビアン 天気 gay genderqueer lesbian lgbtqia nature pride queer rain trans transgender weather
🌂 closed_umbrella|閉じた傘 傘 天気 持ち物 雨 clothing rain
☂️ umbrella|傘 天気 持ち物 雨 clothing rain
☔ umbrella_with_rain_drops|傘と雨 傘 天気 持ち物 雨 雨粒 clothing drop weather
⛱️ umbrella_on_ground|パラソル ビーチ 傘 日傘 砂浜 雨 rain sun
⚡ high_voltage|高電圧 危険 稲妻 雷 電気 danger electric electricity lightning nature thunder thunderbolt zap
❄️ snowflake|雪の結晶 天気 結晶 雪 cold snow weather
☃️ snowman|雪だるまと雪 雪 雪だるま cold man snow
⛄ snowman_without_snow|雪だるま 雪 cold man
☄️ comet|彗星 すい星 宇宙 space
🪋 meteor|隕石 大惨事 宇宙 岩 引力 星 火の玉 落ちる apocalypse falling fireball gravity rock space star
🔥 fire|火 ファイアー ファイヤー 炎 熱い 燃える af burn flame hot lit litaf tool
💧 droplet|水滴 しずく たらーっ 水 汗 涙 cold comic drop nature sad sweat tear water weather
🌊 water_wave|波 天気 波浪 海 自然 nature ocean surf surfer surfing
🎃 jack-o-lantern|ハロウィンかぼちゃ かぼちゃ ハロウィーン ハロウィン celebration halloween jack lantern pumpkin
🎄 christmas_tree|クリスマスツリー クリスマス クリスマスイブ ツリー celebration
🎆 fireworks|打ち上げ花火 お祭り どーん 花火 花火大会 boom celebration entertainment yolo
🎇 sparkler|線香花火 お祭り 火花 花火 boom celebration fireworks sparkle
🧨 firecracker|爆竹 ダイナマイト 火花 火薬 爆発 爆発物 爆薬 花火 dynamite explosive fire fireworks light pop popping spark
✨ sparkles|きらきら キラキラ スター ぴかぴか 星 * magic sparkle star
🎈 balloon|風船 バルーン birthday celebrate celebration
🎉 party_popper|クラッカー お祝い パーティー パーティークラッカー 誕生日 awesome birthday celebrate celebration excited hooray tada woohoo
🎊 confetti_ball|くす玉 お祝い パーティー 紙吹雪 celebrate celebration party woohoo
🎋 tanabata_tree|七夕 和 日本 短冊 笹飾り banner celebration japanese
🎍 pine_decoration|門松 お祝い 和 日本 正月 竹 bamboo celebration japanese plant
🎎 japanese_dolls|ひな祭り おだいり様 おひな様 お祝い ひな人形 人形 和 日本 celebration doll festival
🎏 carp_streamer|こいのぼり お祝い 子供の日 celebration
🎐 wind_chime|風鈴 夏 鈴 風 bell celebration
🎑 moon_viewing_ceremony|月見 ススキ 十五夜 団子 月 celebration
🧧 red_envelope|赤い封筒 お年玉 お金 ご祝儀 幸運 紅包 gift good hóngbāo lai luck money see
🎀 ribbon|リボン お祝い celebration
🎁 wrapped_gift|プレゼント お祝い ギフト リボン 箱 birthday bow box celebration christmas present surprise
🎗️ reminder_ribbon|リマインダーリボン お祝い リボン リマインダー celebration
🎟️ admission_tickets|入場券 チケット 入場パス 半券 ticket
🎫 ticket|チケット 入場券 切符 半券 admission stub
🎖️ military_medal|勲章 お祝い メダル 表彰 award celebration
🏆 trophy|トロフィー チャンピオン 優勝 優勝カップ 表彰 賞杯 champion champs prize slay sport victory win winning
🏅 sports_medal|メダル スポーツ 優勝 表彰 金 金メダル award gold winner
🥇 1st_place_medal|金メダル 1位 ゴールド メダル 優勝 金 first gold
🥈 2nd_place_medal|銀メダル 2位 シルバー メダル 銀 second silver
🥉 3rd_place_medal|銅メダル 3位 ブロンズ メダル 銅 bronze third
⚽ soccer_ball|サッカー サッカーボール スポーツ ボール football futbol sport
⚾ baseball|野球 スポーツ ボール ball sport
🥎 softball|ソフトボール スポーツ ボール 下手投げ ball glove sports underarm
🏀 basketball|バスケットボール スポーツ バスケ ボール ball hoop sport
🏐 volleyball|バレーボール スポーツ バレー ボール ball game
🏈 american_football|アメフト アメリカンフットボール スポーツ フットボール ボール ball bowl sport super
🏉 rugby_football|ラグビー スポーツ ボール ラグビーボール ball sport
🎾 tennis|テニス スポーツ テニスボール ボール ラケット ball racquet sport
🥏 flying_disc|フリスビー アルティメット フライングディスク 円盤 ultimate
🎳 bowling|ボウリング ストライク スポーツ ボール 球 ball game sport strike
🏏 cricket_game|クリケット スポーツ バット ボール ball bat
🏑 field_hockey|ホッケー スティック スポーツ フィールドホッケー ボール ball game stick
🏒 ice_hockey|アイスホッケー スティック スポーツ パック ホッケー game puck stick
🥍 lacrosse|ラクロス ゴール スティック スポーツ ボール ball goal sports stick
🏓 ping_pong|卓球 スポーツ ピンポン ボール ラケット ball bat game paddle pingpong table tennis
🏸 badminton|バドミントン シャトル スポーツ ラケット birdie game racquet shuttlecock
🥊 boxing_glove|ボクシング グローブ スポーツ ボクシンググローブ
🥋 martial_arts_uniform|武道 スポーツ テコンドー 柔道 格闘技 空手 道着 judo karate taekwondo
🥅 goal_net|ゴールネット ゴール スポーツ ネット
⛳ flag_in_hole|ゴルフ スポーツ フラグ フラッグ ホール 旗 golf sport
⛸️ ice_skate|アイススケート スケート スポーツ フィギュアスケート skating
🎣 fishing_pole|釣り スポーツ フィッシング 釣り竿 魚 entertainment fish sport
🤿 diving_mask|ダイビング_マスク シュノーケリング スキューバ スポーツ ダイビング マスク scuba snorkeling
🎽 running_shirt|長距離走 スポーツ たすき ランニング ランニングシャツ 駅伝 athletics sash
🎿 skis|スキー ストック スポーツ 板 雪 ski snow sport
🛷 sled|そり競技 スケルトン スポーツ そり トボガン ボブスレー リュージュ luge sledge sleigh snow toboggan
🥌 curling_stone|カーリング ゲーム ストーン スポーツ 試合 game rock
🎯 bullseye|的 スポーツ ダーツ ブルズアイ 当たり 的中 bull dart direct entertainment game hit target
🪀 yo-yo|ヨーヨー おもちゃ 上下 回転 玩具 fluctuate toy
🪁 kite|たこ おもちゃ カイト 凧揚げ 玩具 fly soar
🔫 water_pistol|水鉄砲 ピストル リボルバー 拳銃 武器 銃 gun handgun revolver tool weapon
🎱 pool_8_ball|ビリヤード エイトボール スポーツ ボール 玉突き 8ball billiard eight game
🔮 crystal_ball|水晶玉 クリスタル 占い 水晶 水晶球 玉 運命 魔法 fairy fairytale fantasy fortune future magic tale tool
🪄 magic_wand|魔法の杖 つえ マジック 手品 杖 魔法 魔術 魔術師 magician witch wizard
🎮 video_game|テレビゲーム ゲーム コントローラ ビデオゲーム controller entertainment
🕹️ joystick|ジョイスティック ゲーム コントローラ スティック テレビゲーム ビデオゲーム game video videogame
🎰 slot_machine|スロットマシン カジノ ギャンブル ゲーム スリーセブン スロット casino gamble gambling game slots
🎲 game_die|サイコロ ゲーム ダイス dice entertainment
🧩 puzzle_piece|ジグソーパズル パズル ピース 組み合わせ 鍵 clue interlocking jigsaw
🧸 teddy_bear|テディベア おもちゃ くま ぬいぐるみ 玩具 plaything plush stuffed toy
🪅 piñata|ピニャータ お祝い パーティー メキシコ 人形 誕生日 candy celebrate celebration cinco de festive mayo party pinada pinata
🪩 mirror_ball|ミラーボール キラキラ ダンス ディスコ パーティー dance disco glitter party
🪆 nesting_dolls|マトリョーシカ ロシア 人形 入れ子 babooshka baboushka babushka doll matryoshka russia
♠️ spade_suit|スペード カード トランプ card game
♥️ heart_suit|ハート カード トランプ card emotion game hearts
♦️ diamond_suit|ダイヤ カード ダイア トランプ card game
♣️ club_suit|クラブ カード クローバー トランプ card clubs game
♟️ chess_pawn|チェスの駒 チェス 捨て駒 駒 dupe expendable
🃏 joker|ジョーカー カード ジジ トランプ ババ card game wildcard
🀄 mahjong_red_dragon|麻雀 ゲーム 中 牌 麻雀牌 game
🎴 flower_playing_cards|花札 カード ゲーム card game japanese
🎭 performing_arts|舞台芸術 仮面 俳優 劇場 女優 役者 演劇 演芸 芸術 actor actress art entertainment mask theater theatre thespian
🖼️ framed_picture|絵画 アート 絵 美術館 芸術 額 art frame museum painting
🎨 artist_palette|絵の具パレット パレット 画家 絵 絵画 美術館 芸術 art artsy arty colorful creative entertainment museum painter painting
🧵 thread|糸 ソーイング ひも 糸巻き 縫い針 裁縫 needle sewing spool string
🪡 sewing_needle|縫い針 ステッチ 刺繍 糸 縫う 裁縫 針 embroidery sew stitches sutures tailoring thread
🧶 yarn|毛糸 かぎ針 ニット 毛糸玉 編み物 ball crochet knit
🪢 knot|結び目 ねじれ ノット ひも ロープ 綱 cord rope tangled tie twine twist
👓 glasses|メガネ 眼鏡 clothing eye eyeglasses eyewear
🕶️ sunglasses|サングラス メガネ 眼鏡 dark eye eyewear glasses
🥽 goggles|ゴーグル スキューバ ダイビング 保護メガネ 水泳 溶接 dive eye protection scuba swimming welding
🥼 lab_coat|白衣 上着 医者 実験 服 科学者 clothes doctor dr experiment jacket scientist white
🦺 safety_vest|安全ベスト チョッキ ベスト 反射 安全 工事 緊急 emergency
👔 necktie|ネクタイ シャツ ワイシャツ 会社員 服 clothing employed serious shirt tie
👕 t-shirt|tシャツ シャツ 服 blue casual clothes clothing collar dressed shirt shopping tshirt weekend
👖 jeans|ジーンズ カジュアル ズボン デニム パンツ ブルージーンズ 服 blue casual clothes clothing denim dressed pants shopping trousers weekend
🧣 scarf|マフラー スカーフ 厚着 寒い 襟巻き 首巻き bundle cold neck up
🧤 gloves|手袋 手 hand
🧥 coat|コート アウター オーバー ジャケット 厚着 寒い 服 brr bundle cold jacket up
🧦 socks|ソックス 靴下 stocking
👗 dress|ワンピース ドレス 服 clothes clothing dressed fancy shopping
👘 kimono|着物 和服 服 clothing comfortable
🥻 sari|サリー ドレス 服 民族衣装 clothing dress
🩱 one-piece_swimsuit|ワンピースの水着 スイムウェア 水着 bathing suit
🩲 briefs|ブリーフ スイムウェア パンツ 下着 水着 bathing one-piece suit swimsuit underwear
🩳 shorts|ショーツ スイムウェア パンツ 下着 水着 bathing pants suit swimsuit underwear
👙 bikini|ビキニ ビーチ プール 水着 bathing beach clothing pool suit swim
👚 woman’s_clothes|婦人服 シャツ ブラウス 服 blouse clothing collar dress dressed lady shirt shopping woman
🪭 folding_hand_fan|扇子 あおぐ パタパタ 団扇 夏 扇 涼む 風 clack clap cool cooling dance flirt flutter hot shy
👛 purse|がま口 小銭入れ 財布 clothes clothing coin dress fancy handbag shopping
👜 handbag|ハンドバッグ かばん ショッピング バッグ bag clothes clothing dress lady purse shopping
👝 clutch_bag|ポーチ クラッチバッグ バッグ ハンドバッグ clothes clothing dress handbag pouch purse
🛍️ shopping_bags|紙袋 ショッピングバッグ バッグ 紙手提げ bag hotel
🎒 backpack|バックパック ランドセル リュックサック 学校 小学校 小学生 backpacking bag bookbag education rucksack satchel school
🩴 thong_sandal|ビーチサンダル ゴムぞうり サンダル トングサンダル ビーサン 靴 beach flip flop sandals shoe thongs zōri
👞 man’s_shoe|紳士靴 ローファー 革靴 靴 brown clothes clothing feet foot kick man shoes shopping
👟 running_shoe|スニーカー ジョギングシューズ テニスシューズ 靴 athletic clothes clothing fast kick shoes shopping sneaker tennis
🥾 hiking_boot|ハイキングシューズ アウトドア キャンプ ハイキング ブーツ 登山靴 茶色い靴 靴 backpacking brown camping outdoors shoe
🥿 flat_shoe|フラットシューズ スリッポン バレエシューズ ぺたんこ靴 ballet comfy flats slip-on slipper
👠 high-heeled_shoe|ハイヒール ピンヒール 婦人靴 靴 clothes clothing dress fashion heel heels shoes shopping stiletto woman
👡 woman’s_sandal|サンダル 婦人靴 靴 clothing shoe woman
🩰 ballet_shoes|トウシューズ シューズ ダンス バレエ バレエシューズ 靴 dance
👢 woman’s_boot|ブーツ ロングブーツ 婦人靴 靴 clothes clothing dress shoe shoes shopping woman
🪮 hair_pick|アフロコーム アフロ くし コーム 髪 afro comb groom
👑 crown|王冠 クラウン 冠 王族 clothing family king medieval queen royal royalty win
👒 woman’s_hat|婦人帽子 帽子 麦わら 麦わら帽子 clothes clothing garden hats party woman
🎩 top_hat|シルクハット 山高帽 帽子 clothes clothing fancy formal magic tophat
🎓 graduation_cap|角帽 卒業 学者 帽子 celebration clothing education hat scholar
🧢 billed_cap|キャップ 帽子 野球帽 baseball bent dad hat
🪖 military_helmet|軍用ヘルメット ヘルメット ミリタリー 兵士 戦闘 軍隊 army soldier war warrior
⛑️ rescue_worker’s_helmet|白十字ヘルメット ヘルメット 帽子 救助隊 救急 白十字 aid cross face hat
📿 prayer_beads|数珠 ネックレス ロザリオ 宗教 念珠 祈る clothing necklace religion
💄 lipstick|口紅 コスメ メーク リップ リップスティック 化粧 化粧品 cosmetics date makeup
💍 ring|指輪 ジュエリー ダイア ダイヤ ダイヤモンド リング 婚約指輪 diamond engaged engagement married romance shiny sparkling wedding
💎 gem_stone|宝石 ジュエリー ダイア ダイヤ ダイヤモンド diamond engagement jewel money romance wedding
🔇 muted_speaker|スピーカー消音 スピーカー ミュート 消音 無音 音無し mute quiet silent sound
🔈 speaker_low_volume|スピーカー ボリューム 音量 soft sound
🔉 speaker_medium_volume|スピーカー音量小 スピーカー ボリューム 音量 音量小 sound
🔊 speaker_high_volume|スピーカー音量大 スピーカー ボリューム 大音量 音量 音量大 loud music sound
📢 loudspeaker|拡声器 スピーカー メガホン 放送 address communication loud public sound
📣 megaphone|メガホン スピーカー 応援 拡声器 cheering sound
📯 postal_horn|郵便ラッパ ラッパ 郵便 post
🔔 bell|ベル 教会 鈴 鐘 break church sound
🔕 bell_with_slash|ベル消音 ミュート 消音 鈴 鐘 音無し forbidden mute no not prohibited quiet silent sound
🎼 musical_score|楽譜 スコア ト音記号 五線譜 音楽 music note
🎵 musical_note|音符 8分音符 連符 音楽 music sound
🎶 musical_notes|複数の音符 8分音符 音楽 音符 music note sound
🎙️ studio_microphone|スタジオマイク マイク 音楽 mic music
🎚️ level_slider|レベルスライダー スライダー レベル 音楽 music
🎛️ control_knobs|コントロールつまみ コントロール つまみ ノブ 調整 音楽 music
🎤 microphone|マイク カラオケ 歌 音楽 karaoke mic music sing sound
🎧 headphone|ヘッドホン イヤホン ヘッドフォン 音楽 earbud sound
📻 radio|ラジオ 受信機 放送 音楽 entertainment tbt video
🎷 saxophone|サックス サキソフォン サクソフォン 楽器 音楽 instrument music sax
🎺 trumpet|トランペット ラッパ 楽器 音楽 instrument music
🪊 trombone|トロンボーン ジャズ スライド 吹奏楽 楽器 管楽器 音楽 brass instrument jazz music sad slide
🪗 accordion|アコーディオン じゃばら 楽器 音楽 box concertina instrument music squeeze squeezebox
🎸 guitar|ギター エレキギター 楽器 音楽 instrument music strat
🎹 musical_keyboard|鍵盤 キーボード ピアノ 楽器 音楽 instrument music piano
🎻 violin|バイオリン ヴィオラ ストラディバリウス 楽器 音楽 instrument music
🪕 banjo|バンジョー 弦楽器 楽器 音楽 music stringed
🥁 drum|ドラム ドラムスティック 太鼓 楽器 音楽 drumsticks music
🪘 long_drum|コンガ ドラム ビート リズム 太鼓 楽器 音楽 beat conga instrument rhythm
🪇 maracas|マラカス シェイカー ダンス パーティー ラトル リズム 打楽器 振る 楽器 音楽 cha dance instrument music party percussion rattle shake shaker
🪈 flute|笛 オーケストラ バンド ピッコロ フルート フルート奏者 リコーダー 楽器 横笛 管楽器 音楽 band fife flautist instrument marching music orchestra piccolo pipe recorder woodwind
🪉 harp|ハープ オーケストラ キューピッド 弦楽器 愛 楽器 音楽 cupid instrument love music orchestra
📱 mobile_phone|携帯電話 スマートフォン スマホ モバイル 携帯 cell communication telephone
📲 mobile_phone_with_arrow|着信中 スマートフォン スマホ モバイル 受信 携帯受信 携帯電話 電話 build call cell communication receive telephone
☎️ telephone|固定電話 ボタン式電話 親機 電話 黒電話 phone
📞 telephone_receiver|受話器 子機 電話 communication phone voip
📟 pager|ポケベル ページャー ポケットベル communication
📠 fax_machine|ファックス 複合機 電話 communication
🔋 battery|電池 バッテリー 乾電池
🪫 low_battery|バッテリー残量低下 バッテリー 充電不足 電池切れ寸前 電池残量低下 drained electronic energy power
🔌 electric_plug|コンセント プラグ 電気 電源 electricity
💻 laptop|ノートパソコン pc コンピューター パソコン ラップトップ computer office personal
🖥️ desktop_computer|デスクトップパソコン pc コンピューター デスクトップ パソコン モニター monitor
🖨️ printer|プリンタ コピー機 コンピューター プリンター 印刷機 複合機 computer
⌨️ keyboard|キーボード pc コンピューター パソコン computer
🖱️ computer_mouse|マウス pc コンピューター パソコン
🖲️ trackball|トラックボール pc コンピューター パソコン computer
💽 computer_disk|md mo コンピューター ミニディスク minidisk optical
💾 floppy_disk|フロッピー fd コンピューター ディスク フロッピーディスク computer
💿 optical_disk|cd blu-ray dvd コンピューター ディスク ブルーレイ 光ディスク computer
📀 dvd|blu-ray cd ディスク ブルーレイ computer disk optical
🧮 abacus|そろばん アバカス 算盤 計算 calculation calculator
🎥 movie_camera|映画カメラ カメラ シネマ ハリウッド フィルム ムービー 撮影 映画 bollywood cinema film hollywood record
🎞️ film_frames|映画フィルム シネマ フィルム フレーム ムービー 映画 cinema movie
📽️ film_projector|映写機 ビデオ フィルム プロジェクター ムービー 映画 cinema movie video
🎬 clapper_board|カチンコ 映画 action movie
📺 television|テレビ tv ビデオ video
📷 camera|カメラ 写真 photo selfie snap tbt trip video
📸 camera_with_flash|フラッシュを焚いているカメラ カメラ カメラフラッシュ フラッシュ 写真 video
📹 video_camera|ビデオカメラ カメラ ビデオ ムービー 動画 録画 camcorder tbt
📼 videocassette|ビデオテープ vhs テープ ビデオ ビデオカセット 動画 old school tape vcr video
🔍 magnifying_glass_tilted_left|虫眼鏡左 ルーペ 拡大鏡 検索 科学 虫めがね lab left-pointing science search tool
🔎 magnifying_glass_tilted_right|虫眼鏡右 ルーペ 拡大鏡 検索 科学 虫めがね contact lab right-pointing science search tool
🕯️ candle|ろうそく キャンドル ロウソク 明かり light
💡 light_bulb|電球 ぴこーん ひらめき マンガ 明かり comic electric idea
🔦 flashlight|懐中電灯 ライト 明かり electric light tool torch
🏮 red_paper_lantern|赤ちょうちん ちょうちん 居酒屋 飲み屋 bar light restaurant
🪔 diya_lamp|ディヤランプ オイル ランプ 明かり light oil
📔 notebook_with_decorative_cover|表紙付きノート ノート 学校 文具 文房具 本 book decorated education school writing
📕 closed_book|閉じた本 書籍 本 赤い本 education
📖 open_book|開いた本 図書館 小説 書籍 本 知識 読書 education fantasy knowledge library novels reading
📗 green_book|緑の本 図書館 書籍 本 読書 education fantasy library reading
📘 blue_book|青の本 図書館 書籍 本 読書 青い本 education fantasy library reading
📙 orange_book|オレンジの本 図書館 書籍 本 読書 education fantasy library reading
📚 books|本の山 勉強 学校 小説 書籍 本 読書 book education fantasy knowledge library novels reading school study
📓 notebook|ノート 手帳 文具 文房具
📒 ledger|リングノート ノート 台帳 文具 文房具 notebook
📃 page_with_curl|巻きページ カール ドキュメント 文書 書類 document paper
📜 scroll|巻き物 文書 書類 紙 paper
📄 page_facing_up|ページ ドキュメント 文書 書類 document paper
📰 newspaper|新聞 ニュース 新聞紙 communication news paper
🗞️ rolled-up_newspaper|丸めた新聞 ニュース 新聞 新聞紙 news paper rolled
📑 bookmark_tabs|ページに付箋 ふせん 付箋 文具 文房具 mark marker
🔖 bookmark|しおり タグ ブックマーク 付箋 mark
🏷️ label|荷札 タグ ラベル tag
🪙 coin|コイン お金 小銭 硬貨 金貨 銀貨 dollar euro gold metal money rich silver treasure
💰 money_bag|ドル袋 お金 キャッシュ ドル 現金 賞金 賭け金 金持ち 金袋 銀行 bank bet billion cash cost dollar gold million moneybag paid paying pot rich win
🪎 treasure_chest|宝箱 お宝 お金 ジュエリー 宝石 富 財宝 貴金属 金貨 gem gold jewels loot money prize silver valuables wealth
💴 yen_banknote|円札 お札 お金 円 札束 紙幣 通貨 bank bill currency money note
💵 dollar_banknote|ドル札 お札 お金 ドル 札束 紙幣 通貨 bank bill currency money note
💶 euro_banknote|ユーロ札 お札 お金 ユーロ 札束 紙幣 通貨 100 bank bill currency money note rich
💷 pound_banknote|ポンド札 お札 お金 ポンド 札束 現金 紙幣 通貨 bank bill billion cash currency money note pounds
💸 money_with_wings|羽が生えたお金 お札 お金 ドル 支払い 札束 紙幣 bank banknote bill billion cash dollar fly million note pay
💳 credit_card|クレジットカード お金 カード キャッシュカード 支払い 銀行 bank cash charge money pay
🧾 receipt|レシート 会計 簿記 請求書 領収書 accounting bookkeeping evidence invoice proof
💹 chart_increasing_with_yen|為替 グラフ チャート 円 円高 市場 株 株価 bank currency graph growth market money rise trend upward
✉️ envelope|封筒 eメール メール 手紙 郵便 電子メール e-mail email letter
📧 e-mail|eメール メール 封筒 手紙 郵便 電子メール email letter mail
📨 incoming_envelope|メール受信中 eメール 受信中 受信箱 封筒 手紙 電子メール delivering e-mail email letter mail receive sent
📩 envelope_with_arrow|メール受信 eメール メール送信 受信 封筒と矢印 送信 電子メール communication down e-mail email letter mail outgoing send sent
📤 outbox_tray|送信トレイ eメール トレイ 箱 送信 送信箱 電子メール box email letter mail sent
📥 inbox_tray|受信トレイ eメール トレイ 受信 受信なし 受信箱 箱 電子メール box email letter mail receive zero
📦 package|荷物 宅急便 宅配便 小包 段ボール 箱 配送 配達 box communication delivery parcel shipping
📫 closed_mailbox_with_raised_flag|閉じた郵便受け（手紙あり） ポスト 手紙あり 郵便受け 郵便箱 閉じた communication mail postbox
📪 closed_mailbox_with_lowered_flag|閉じた郵便受け（手紙なし） ポスト 手紙なし 郵便受け 郵便箱 閉じた mail postbox
📬 open_mailbox_with_raised_flag|開いた郵便受け（手紙あり） ポスト 手紙あり 郵便受け 郵便箱 開いた mail postbox
📭 open_mailbox_with_lowered_flag|開いた郵便受け（手紙なし） ポスト 手紙なし 郵便受け 郵便箱 開いた mail postbox
📮 postbox|郵便ポスト ポスト 手紙 郵便 郵便箱 mail mailbox
🗳️ ballot_box_with_ballot|投票箱 投票 選挙
✏️ pencil|鉛筆 文具 文房具
✒️ black_nib|ペン先 万年筆 文具 文房具 pen
🖋️ fountain_pen|万年筆 ペン 文具 文房具
🖊️ pen|ペン ボールペン 文具 文房具 ballpoint
🖌️ paintbrush|絵筆 文具 文房具 絵の具 painting
🖍️ crayon|クレヨン 文具 文房具
📝 memo|鉛筆とメモ メモ 文具 文房具 紙と鉛筆 鉛筆 communication media notes pencil
🪌 eraser|消しゴム こする やり直す 修正 削除 書く 校正 消す 訂正 誤字 間違い correction delete drawing erase error mistake remove rub undo writing
💼 briefcase|ブリーフケース かばん 鞄 office
📁 file_folder|フォルダー ファイル 文具 文房具
📂 open_file_folder|開いたフォルダー ファイル フォルダー 文具 文房具 開く
🗂️ card_index_dividers|カードフォルダー インデックス フォルダー 文具 文房具
📅 calendar|カレンダー スケジュール 予定 日付 date
📆 tear-off_calendar|日めくりカレンダー カレンダー スケジュール 予定 日付
🗒️ spiral_notepad|メモ帳 ノート リングメモ 文具 文房具 note pad
🗓️ spiral_calendar|月めくりカレンダー カレンダー スケジュール 予定 日付 pad
📇 card_index|カードインデックス 名刺ホルダー 文具 文房具 old rolodex school
📈 chart_increasing|グラフ上向き グラフ チャート データ 上向き 上昇 右肩上がり 成長 折れ線グラフ data graph growth right trend up upward
📉 chart_decreasing|グラフ下向き チャート データ 下向き 下降 右肩下がり 折れ線グラフ data down downward graph negative trend
📊 bar_chart|棒グラフ グラフ チャート データ data graph
📋 clipboard|クリップボード クリップ メモ 文具 文房具 do list notes
📌 pushpin|押しピン 文具 文房具 画鋲 collage pin
📍 round_pushpin|丸い押しピン ピン プッシュピン 地図 押しピン 文具 文房具 画びょう location map pin
📎 paperclip|クリップ ゼムクリップ ペーパークリップ 文具 文房具 紙クリップ
🖇️ linked_paperclips|つながったクリップ クリップ ペーパークリップ 文具 文房具 紙クリップ link paperclip
📏 straight_ruler|定規 ものさし 文具 文房具 直定規 angle edge math straightedge
📐 triangular_ruler|三角定規 定規 文具 文房具 angle math rule set slide triangle
✂️ scissors|はさみ カット ハサミ 切る 文具 文房具 cut cutting paper tool
🗃️ card_file_box|カードファイルボックス カード ファイル ボックス 文具 文房具 箱
🗄️ file_cabinet|ファイルキャビネット キャビネット ファイル 引き出し filing paper
🗑️ wastebasket|ごみ箱 くずかご ごみかご ゴミ箱 can garbage trash waste
🔒 locked|閉じた錠 ロック 南京錠 施錠 錠 鍵 closed lock private
🔓 unlocked|開いた錠 ロック 南京錠 解錠 錠 鍵 cracked lock open unlock
🔏 locked_with_pen|閉じた錠とペン プライバシー ロック 南京錠 鍵 ink lock nib privacy
🔐 locked_with_key|閉じた錠と鍵 キー セキュリティ ロック 南京錠 安全 錠 鍵 bike closed lock secure
🔑 key|鍵 キー パスワード 開錠 keys lock major password unlock
🗝️ old_key|古い鍵 キー パスワード 手がかり 鍵 clue lock
🪍 net_with_handle|虫取り網 捕まえる 捕獲 網 罠 集める catch collect mesh trap
🔨 hammer|ハンマー かなづち とんかち 工具 home improvement repairs tool
🪓 axe|斧 おの ハチェット 工具 木 薪割り ax chop hatchet split wood
⛏️ pick|つるはし 工具 採掘 hammer mining tool
⚒️ hammer_and_pick|ハンマーとつるはし かなづち つるはし とんかち ハンマー 工具 tool
🛠️ hammer_and_wrench|ハンマーとレンチ かなづち スパナ とんかち レンチ 工具 spanner tool
🗡️ dagger|短刀 ダガー ナイフ 武器 短剣 knife weapon
⚔️ crossed_swords|クロスした剣 つるぎ 刀 剣 武器 weapon
💣 bomb|爆弾 危険 爆発 boom comic dangerous explosion hot
🪃 boomerang|ブーメラン オーストラリア 武器 玩具 跳ね返り 返って来る rebound repercussion weapon
🏹 bow_and_arrow|弓矢 射手 射手座 弓 星座 武器 矢 archer archery sagittarius tool weapon zodiac
🛡️ shield|盾 シールド 防具 weapon
🪚 carpentry_saw|のこぎり ノコ 刃 切る 大工 工具 木工 carpenter cut lumber tool trim
🔧 wrench|レンチ スパナ 工具 home improvement spanner tool
🪛 screwdriver|ねじ回し スクリュードライバー ドライバー マイナスドライバー 工具 flathead handy screw tool
🔩 nut_and_bolt|ボルトとナット ナット ボルト 工具 home improvement tool
⚙️ gear|歯車 ギア 工具 cog cogwheel tool
🗜️ clamp|万力 クランプ バイス 工具 compress tool vice
⚖️ balance_scale|天秤 はかり バランス 化学 天秤座 実験 星座 justice libra scales tool weight zodiac
🦯 white_cane|白杖 アクセシビリティ つえ 視覚 障がい accessibility blind probing
🔗 link|リンクシンボル リンク 環 links
⛓️‍💥 broken_chain|壊れた鎖 くさり チェーン 壊れた break breaking cuffs freedom
⛓️ chains|鎖 くさり チェーン chain
🪝 hook|フック 引っかけ 引っ掛け 掛け金 留め金 鉤 catch crook curve ensnare point selling
🧰 toolbox|工具箱 ツールボックス メカニック 整備士 機械工 箱 赤い箱 box chest mechanic red tool
🧲 magnet|u字型磁石 マグネット 引き付ける 正負 磁石 蹄鉄 attraction horseshoe magnetic negative positive shape u
🪜 ladder|はしご ステッパー 梯子 登る 高所作業 climb rung step
🪏 shovel|シャベル ショベル スコップ 掘る 穴 鋤 bury dig garden hole plant scoop snow spade
⚗️ alembic|蒸留器 化学 実験 chemistry tool
🧪 test_tube|試験管 ラボ 化学 化学者 実験 科学 chemist chemistry experiment lab science
🧫 petri_dish|ペトリ皿 バクテリア 培養 実験 生物学 生物学者 bacteria biologist biology culture lab
🧬 dna|生命 生物学 生物学者 進化 遺伝子 biologist evolution gene genetics life
🔬 microscope|顕微鏡 サイエンス 実験 研究 科学 experiment lab science tool
🔭 telescope|望遠鏡 サイエンス 天体観測 科学 観測 contact extraterrestrial science tool
📡 satellite_antenna|パラボラアンテナ アンテナ パラボラ 科学 衛星アンテナ 電波 aliens contact dish science
💉 syringe|注射器 予防接種 医療器具 医者 注射 病気 薬 針 doctor flu medicine needle shot sick tool vaccination
🩸 drop_of_blood|血液 けが 出血 医療 医者 献血 生理 bleed donation injury medicine menstruation
💊 pill|薬 カプセル ビタミン剤 医者 病気 doctor drugs medicated medicine pills sick vitamin
🩹 adhesive_bandage|絆創膏 けが ばんそうこう 傷 手当て 薬
🩼 crutch|松葉杖 ステッキ 怪我 杖 歩行補助 障がい aid cane disability help hurt injured mobility stick
🩺 stethoscope|聴診器 医療 医者 心臓 病気 doctor heart medicine
🩻 x-ray|x線 レントゲン 医者 骨 骨格 bones doctor medical skeleton skull xray
🚪 door|ドア 戸 扉 玄関 back closet front
🛗 elevator|エレベーター アクセシビリティ バリアフリー リフト 昇降機 accessibility hoist lift
🪞 mirror|鏡 ミラー メーク 反射 姿見 身だしなみ makeup reflection reflector speculum
🪟 window|窓 ウィンドウ フレーム 換気 眺め 開ける air frame fresh opening transparent view
🛏️ bed|ベッド ホテル 寝る 睡眠 hotel sleep
🛋️ couch_and_lamp|ソファとランプ ソファ ホテル ランプ 長椅子 hotel
🪑 chair|椅子 シート チェア 家具 腰掛け seat sit
🚽 toilet|便器 お手洗い トイレ 便座 bathroom
🪠 plunger|ラバーカップ すっぽん トイレ プランジャー 吸引カップ 通水カップ cup force plumber poop suction toilet
🚿 shower|シャワー 風呂 water
🛁 bathtub|バスタブ 泡風呂 浴槽 風呂 bath
🪤 mouse_trap|ねずみ捕り おびき寄せる チーズ ばね マウストラップ わな 仕掛け bait cheese lure mousetrap snare
🪒 razor|剃刀 かみそり ひげそり レーザー レザー 刃 刃物 鋭い sharp shave
🧴 lotion_bottle|ローション シャンプー ローションボトル 化粧水 日焼け止め moisturizer shampoo sunscreen
🧷 safety_pin|安全ピン 止めピン diaper punk rock
🧹 broom|ほうき 掃く 掃除 魔女 cleaning sweeping witch
🧺 basket|かご ピクニック 収穫 洗濯 farming laundry picnic
🧻 roll_of_paper|トイレットペーパー キッチンペーパー ペーパータオル ロールペーパー toilet towels
🪣 bucket|バケツ おけ ばけつ ポリバケツ 容器 cask pail vat
🧼 soap|石けん ソープ 泡 清潔 風呂 bar bathing clean cleaning lather soapdish
🫧 bubbles|泡 あぶく シャボン玉 バブル 水中 石けん bubble burp clean floating pearl soap underwater
🪥 toothbrush|歯ブラシ お手入れ ブラシ 歯磨き 洗面所 虫歯 衛生 bathroom brush clean dental hygiene teeth toiletry
🧽 sponge|スポンジ 吸収 掃除 海綿 absorbing cleaning porous soak
🧯 fire_extinguisher|消火器 消火 消火器具 消防 火事 extinguish quench
🛒 shopping_cart|ショッピングカート カート ショッピング スーパー 買い物 trolley
🚬 cigarette|煙草 たばこ タバコ 喫煙 smoking
⚰️ coffin|棺桶 吸血鬼 埋葬 棺 死 死者 dead death vampire
🪦 headstone|墓石 お墓 埋葬 墓地 墓場 石碑 追悼 cemetery dead grave graveyard memorial rip tomb tombstone
⚱️ funeral_urn|骨壺 埋葬 死 葬儀 遺灰 ashes death
🧿 nazar_amulet|ナザール・ボンジュウ お守り ナザール ビーズ 邪視 青 魔除け bead blue charm evil-eye talisman
🪬 hamsa|ハムサ お守り ファーティマ ミリアム 手 目 護符 amulet fatima fortune guide hand mary miriam palm protect protection
🗿 moai|モアイ モヤイ 像 石像 顔 face moyai statue stoneface travel
🪧 placard|プラカード デモ 主張 抗議 異議 看板 card demonstration notice picket plaque protest sign
🪪 identification_card|身分証 id セキュリティ 免許証 身分証明書 運転免許証 credentials document license security
🏧 atm_sign|現金自動預け払い機 銀行 automated bank cash money teller
🚮 litter_in_bin_sign|ゴミ箱 くずかご ゴミ捨て ごみ箱 litterbin
🚰 potable_water|飲料水 水 水道 飲み水 drinking
♿ wheelchair_symbol|車椅子 バリアフリー バリヤフリー access handicap
🚹 men’s_room|男子トイレ wc お手洗い トイレ 化粧室 男性 bathroom lavatory man restroom toilet
🚺 women’s_room|女子トイレ wc お手洗い トイレ 化粧室 女性 bathroom lavatory restroom toilet woman
🚻 restroom|トイレ wc お手洗い 化粧室 bathroom lavatory toilet
🚼 baby_symbol|ベビーマーク ベビー ベビーシート 赤ちゃん 赤ん坊 changing
🚾 water_closet|wc お手洗い トイレ 化粧室 bathroom lavatory restroom toilet
🛂 passport_control|出入国審査 パスポートコントロール 入出国 出入国
🛃 customs|税関 通関 packing
🛄 baggage_claim|手荷物受取 スーツケース バゲッジクレーム 手荷物 預け入れ荷物 arrived bags case checked journey packing plane ready travel trip
🛅 left_luggage|手荷物預かり コインロッカー スーツケース ロッカー 手荷物 baggage case locker
⚠️ warning|警告 標識 注意 caution
🚸 children_crossing|児童横断 子供 学校、幼稚園、保育所等あり 標識 通学路 child pedestrian traffic
⛔ no_entry|車両進入禁止 標識 禁止 規制 進入禁止 道路 do fail forbidden not pass prohibited traffic
🚫 prohibited|車両通行止め 標識 禁止 規制 通行止め 道路 entry forbidden no not smoke
🚳 no_bicycles|自転車禁止 標識 禁止 自転車 規制 道路 bicycle bike forbidden not prohibited
🚭 no_smoking|禁煙 タバコ 煙草 禁止 forbidden not prohibited smoke
🚯 no_littering|ポイ捨て禁止 ごみ ゴミ ゴミ捨て禁止 禁止 forbidden litter not prohibited
🚱 non-potable_water|飲用不可 禁止 飲めない水 飲用禁止 dry non-drinking prohibited
🚷 no_pedestrians|歩行者立入禁止 標識 禁止 規制 道路 forbidden not pedestrian prohibited
📵 no_mobile_phones|携帯電話禁止 スマートフォン禁止 スマホ禁止 携帯禁止 cell forbidden not phone prohibited telephone
🔞 no_one_under_eighteen|18歳未満禁止 18禁 年齢制限 未成年 禁止 18 age forbidden not prohibited restriction underage
☢️ radioactive|放射能 危険 放射性 放射線 sign
☣️ biohazard|バイオハザード 危険 有害物質 sign
⬆️ up_arrow|上矢印 上 北 矢印 cardinal direction north
↗️ up-right_arrow|右上矢印 北東 右上 矢印 direction intercardinal northeast
➡️ right_arrow|右矢印 右 東 矢印 cardinal direction east
↘️ down-right_arrow|右下矢印 南東 右下 矢印 direction intercardinal southeast
⬇️ down_arrow|下矢印 下 南 矢印 cardinal direction south
↙️ down-left_arrow|左下矢印 南西 左下 矢印 direction intercardinal southwest
⬅️ left_arrow|左矢印 左 矢印 西 cardinal direction west
↖️ up-left_arrow|左上矢印 北西 左上 矢印 direction intercardinal northwest
↕️ up-down_arrow|上下矢印 上下 矢印
↔️ left-right_arrow|左右矢印 左右 矢印
↩️ right_arrow_curving_left|右カーブ矢印 カーブ 左 曲線 矢印
↪️ left_arrow_curving_right|左カーブ矢印 カーブ 右 曲線 矢印
⤴️ right_arrow_curving_up|上カーブ矢印 カーブ 上 曲線 矢印
⤵️ right_arrow_curving_down|下カーブ矢印 カーブ 下 曲線 矢印
🔃 clockwise_vertical_arrows|右回り縦矢印 リロード 再読み込み 右回り 時計回り 矢印 arrow refresh reload
🔄 counterclockwise_arrows_button|左回り矢印 リピート 反時計回り 更新 矢印 繰り返し 逆回り again anticlockwise arrow deja refresh rewindershins vu
🔙 back_arrow|back矢印 バック 戻る 矢印
🔚 end_arrow|end矢印 エンド 矢印 終わり
🔛 on!_arrow|on矢印 on オン 矢印 mark
🔜 soon_arrow|soon矢印 すぐ 矢印 brb omw
🔝 top_arrow|top矢印 トップ 上 矢印 homie up
🛐 place_of_worship|礼拝所 宗教 礼拝 祈り pray religion
⚛️ atom_symbol|原子のシンボル 元素 分子 原子 無神論 atheist
🕉️ om|オーム ヒンズー教 ヒンドゥー教 宗教 hindu religion
✡️ star_of_david|ダビデの星 ユダヤ教 六芒星 宗教 星 jew jewish judaism religion
☸️ wheel_of_dharma|法輪 仏教 宗教 転法輪 buddhist religion
☯️ yin_yang|陰陽 インヤン 宗教 道教 difficult lives religion tao taoist total yinyang
✝️ latin_cross|十字架 キリスト教 クロス ラテン十字 宗教 christ christian religion
☦️ orthodox_cross|八端十字架 キリスト教 十字架 宗教 christian religion
☪️ star_and_crescent|星と三日月 イスラム教 ムスリム 三日月 宗教 星 islam muslim ramadan religion
☮️ peace_symbol|ピースマーク 平和 平和のシンボル healing peaceful
🕎 menorah|メノーラー ハヌカー メノラー ユダヤ教 宗教 燭台 candelabrum candlestick hanukkah jewish judaism religion
🔯 dotted_six-pointed_star|六芒星 ダビデ ユダヤ教 六角星 占い 星 fortune jewish judaism
🪯 khanda|カンダ カルサ シーク教 シーク教徒 シク教 信仰 剣 宗教 deg fateh khalsa religion sikh sikhism tegh
♈ aries|おひつじ座 星座 牡羊座 horoscope ram zodiac
♉ taurus|おうし座 星座 牡牛座 bull horoscope ox zodiac
♊ gemini|ふたご座 双子座 星座 horoscope twins zodiac
♋ cancer|かに座 星座 蟹座 crab horoscope zodiac
♌ leo|しし座 星座 獅子座 horoscope lion zodiac
♍ virgo|おとめ座 乙女座 星座 horoscope zodiac
♎ libra|てんびん座 天秤座 星座 balance horoscope justice scales zodiac
♏ scorpio|さそり座 星座 蠍座 horoscope scorpion scorpius zodiac
♐ sagittarius|いて座 射手座 星座 archer horoscope zodiac
♑ capricorn|やぎ座 山羊座 星座 goat horoscope zodiac
♒ aquarius|みずがめ座 星座 水瓶座 bearer horoscope water zodiac
♓ pisces|うお座 星座 魚座 fish horoscope zodiac
⛎ ophiuchus|へびつかい座 星座 蛇遣座 bearer serpent snake zodiac
🔀 shuffle_tracks_button|シャッフルボタン シャッフル ボタン 交差 矢印 arrow crossed
🔁 repeat_button|リピートボタン ボタン リピート 全曲 時計回り 矢印 繰り返し arrow clockwise
🔂 repeat_single_button|1曲リピートボタン ボタン リピート 時計回り 矢印 繰り返し arrow clockwise once
▶️ play_button|再生ボタン プレイ ボタン 再生 矢印 arrow right triangle
⏩ fast-forward_button|早送りボタン ボタン 倍速 早送り 矢印 arrow double fast forward
⏭️ next_track_button|次の曲ボタン ボタン 次のシーン 次のトラック 矢印 arrow scene triangle
⏯️ play_or_pause_button|再生／一時停止ボタン ボタン 一時停止 再生 矢印 arrow right triangle
◀️ reverse_button|逆再生ボタン ボタン 巻き戻し 矢印 逆再生 arrow left triangle
⏪ fast_reverse_button|早戻しボタン 倍速 巻き戻し 戻る 早戻し 矢印 arrow double rewind
⏮️ last_track_button|前の曲ボタン ボタン 前のシーン 前のトラック 矢印 arrow previous scene triangle
🔼 upwards_button|上ボタン ボタン 上 矢印 arrow red up
⏫ fast_up_button|高速上ボタン ボタン 上 二重 矢印 arrow double
🔽 downwards_button|下ボタン ボタン 下 矢印 arrow down red
⏬ fast_down_button|高速下ボタン ボタン 下 二重 矢印 arrow double
⏸️ pause_button|一時停止ボタン ポーズ ボタン 一時停止 bar double vertical
⏹️ stop_button|停止ボタン ストップ ボタン 停止 四角 square
⏺️ record_button|録音録画ボタン ボタン 丸 録画 録音 circle
⏏️ eject_button|取り出しボタン イジェクト ボタン 取り出し
🎦 cinema|映画 カメラ 動画 映画館 camera film movie
🔅 dim_button|低輝度 ブライトネス 明るさ 暗い 輝度 brightness low
🔆 bright_button|高輝度 ブライトネス 明るい 明るさ 輝度 brightness light
📶 antenna_bars|アンテナマーク スマートフォン スマホ 圏内 携帯電話 電波 bar cell communication mobile phone signal telephone
🛜 wireless|wi-fi インターネット スマホ ネットワーク ブロードバンド ホットスポット 接続 無線 無線lan 電波 broadband computer connectivity hotspot internet network router smartphone wifi wlan
📳 vibration_mode|マナーモード スマートフォン スマホ 携帯 携帯電話 cell communication mobile phone telephone
📴 mobile_phone_off|携帯電話電源オフ オフ スマートフォン スマホ 携帯電話 電源オフ cell telephone
♀️ female_sign|女性のマーク シンボル 女 女性 woman
♂️ male_sign|男性のマーク シンボル 男 男性 man
⚧️ transgender_symbol|トランスジェンダーのマーク lgbt tg シンボル 性別
✖️ multiply|掛け算 キャンセル バツ ペケ 乗算 記号 × cancel multiplication sign x
➕ plus|プラス + 加算 記号 足し算 足す
➖ minus|マイナス - 引き算 引く 減算 計算 記号 − heavy math sign
➗ divide|割り算 / 割る 記号 除算 ÷ division heavy math sign
🟰 heavy_equals_sign|太字の等号 イコール 数学 等しい 等号 answer equal equality math
♾️ infinity|無限大 万物 永遠 無限 forever unbounded universal
‼️ double_exclamation_mark|二重感嘆符 ! エクスクラメーションマーク びっくりマーク 感嘆符 約物 記号 !! bangbang punctuation
⁉️ exclamation_question_mark|感嘆符疑問符 ! !? ? はてなマーク びっくりマーク 記号 interrobang punctuation
❓ red_question_mark|赤い疑問符 ? クエスチョンマーク はてなマーク 疑問符 約物 記号 punctuation
❔ white_question_mark|白い疑問符 ? クエスチョンマーク はてなマーク 疑問符 約物 記号 outlined punctuation
❕ white_exclamation_mark|白い感嘆符 ! エクスクラメーションマーク びっくりマーク 疑問符 約物 記号 bang outlined punctuation
❗ red_exclamation_mark|赤い感嘆符 ! エクスクラメーションマーク びっくりマーク 感嘆符 約物 記号 bang punctuation
〰️ wavy_dash|波線 波 約物 記号 punctuation
💱 currency_exchange|外貨両替 お金 ドル ドル円 両替 円 円ドル 通貨 bank money
💲 heavy_dollar_sign|ドル記号 お金 ドル 通貨 billion cash charge currency million money pay
⚕️ medical_symbol|医療のシンボル アスクレピオスの杖 医療 医者 治療 aesculapius medicine staff
♻️ recycling_symbol|リサイクルマーク リサイクル 再利用 再生 recycle
⚜️ fleur-de-lis|フルール・ド・リス エンブレム フランス王家 ユリ 紋章 knights
🔱 trident_emblem|トライデント エンブレム 三つ又 海 anchor poseidon ship tool
📛 name_badge|名札 バッジ 保育園 保育所 幼稚園
🔰 japanese_symbol_for_beginner|初心者マーク 初心者 若葉マーク chevron green leaf tool yellow
⭕ hollow_red_circle|太い丸 円 記号 赤い丸 輪 heavy large o
✅ check_mark_button|白抜きのチェック チェック チェックマーク 済 記号 ✓ checked checkmark complete completed done fixed tick
☑️ check_box_with_check|チェックボックス チェック チェックマーク 済 記号 ✓ ballot checked done off tick
✔️ check_mark|太字のチェック チェック チェックマーク 済 記号 ✓ checked checkmark done heavy tick
❌ cross_mark|バツ キャンセル ペケ 乗算 掛け算 記号 × cancel multiplication multiply x
❎ cross_mark_button|白抜きのバツ キャンセル バツ ペケ 乗算 掛け算 記号 × multiplication multiply square x
➰ curly_loop|ループ 記号 輪っか 長音 curl
➿ double_curly_loop|ダブルループ フリーダイヤル ループ 記号 輪っか curl
〽️ part_alternation_mark|いおりてん 庵点 歌記号 約物 記号
✳️ eight-spoked_asterisk|八角アスタリスク アスタリスク 約物 記号 *
✴️ eight-pointed_star|八角星 星 約物 記号 *
❇️ sparkle|スパークル アスタリスク キラキラ 約物 記号 *
©️ copyright|著作権マーク cマーク コピーライト 著作権 記号 c
®️ registered|登録商標マーク rマーク 登録商標 記号 r
™️ trade_mark|商標マーク tmマーク トレードマーク 商標 記号 tm trademark
🫟 splatter|飛び散ったペンキ しぶき スプラッシュ ペンキ 飛び散り 飛沫 drip holi ink liquid mess paint spill stain
#️⃣ keycap_#|囲み数字_# 囲み数字
*️⃣ keycap_*|囲み数字_* 囲み数字
0️⃣ keycap_0|囲み数字_0 囲み数字 zero
1️⃣ keycap_1|囲み数字_1 一 囲み数字 one
2️⃣ keycap_2|囲み数字_2 二 囲み数字 two
3️⃣ keycap_3|囲み数字_3 三 囲み数字 three
4️⃣ keycap_4|囲み数字_4 四 囲み数字 four
5️⃣ keycap_5|囲み数字_5 五 囲み数字 five
6️⃣ keycap_6|囲み数字_6 六 囲み数字 six
7️⃣ keycap_7|囲み数字_7 七 囲み数字 seven
8️⃣ keycap_8|囲み数字_8 八 囲み数字 eight
9️⃣ keycap_9|囲み数字_9 九 囲み数字 nine
🔟 keycap_10|囲み数字_10 囲み数字
🔠 input_latin_uppercase|英大文字の入力 abcd アルファベット ローマ字 入力 大文字 英字 letters
🔡 input_latin_lowercase|英小文字の入力 abcd アルファベット ローマ字 入力 小文字 英字 letters
🔢 input_numbers|数字の入力 1234 入力 数字
🔣 input_symbols|記号の入力 〒♪&% 入力 記号 & % ♪ 〒
🔤 input_latin_letters|英字の入力 abc アルファベット ローマ字 入力 英字 alphabet
🅰️ a_button_(blood_type)|血液型a型 a型 血液型 blood type
🆎 ab_button_(blood_type)|血液型ab型 ab型 血液型 blood type
🅱️ b_button_(blood_type)|血液型b型 b型 血液型 blood type
🆑 cl_button|clマーク クリア
🆒 cool_button|coolマーク クール
🆓 free_button|freeマーク タダ フリー 無料
ℹ️ information|iマーク i インフォメーション 情報 案内所
🆔 id_button|idマーク アイディー identity
Ⓜ️ circled_m|丸いmマーク 丸 circle
🆕 new_button|newマーク 新 新しい
🆖 ng_button|ngマーク エヌジー ボツ
🅾️ o_button_(blood_type)|血液型o型 o型 血液型 blood type
🆗 ok_button|okマーク オーケー オッケー okay
🅿️ p_button|pマーク パーキング 駐車場 parking
🆘 sos_button|sosマーク エスオーエス 助けて help
🆙 up!_button|upマーク up アップ 更新 mark
🆚 vs_button|vsマーク ヴァーサス ヴィエス バーサス ブイエス 対 versus
🈁 japanese_“here”_button|ココのマーク ここ ココ here katakana
🈂️ japanese_“service_charge”_button|サのマーク サ サービス料 charge katakana service
🈷️ japanese_“monthly_amount”_button|月マーク 月 月極 月額 amount ideograph monthly
🈶 japanese_“not_free_of_charge”_button|有マーク 有 有料 有限 charge ideograph not
🈯 japanese_“reserved”_button|指マーク 指 指定席 ideograph reserved
🉐 japanese_“bargain”_button|マル得 お得 バーゲン 得 bargain ideograph
🈹 japanese_“discount”_button|割マーク ディスカウント 割 割引 discount ideograph
🈚 japanese_“free_of_charge”_button|無マーク タダ 無 無料 charge free ideograph
🈲 japanese_“prohibited”_button|禁マーク 厳禁 禁 禁止 ideograph prohibited
🉑 japanese_“acceptable”_button|可マーク 可 可能 許可 acceptable ideograph
🈸 japanese_“application”_button|申マーク 申 申し込み 申請 application ideograph
🈴 japanese_“passing_grade”_button|合マーク 合 合格 grade ideograph passing
🈳 japanese_“vacancy”_button|空マーク 空 空き 空室 空席 ideograph vacancy
㊗️ japanese_“congratulations”_button|祝マーク おめでとう お祝い 祝 congratulations ideograph
㊙️ japanese_“secret”_button|マル秘 極秘 社外秘 秘 秘密 ideograph secret
🈺 japanese_“open_for_business”_button|営マーク 営 営業中 営業日 business ideograph open
🈵 japanese_“no_vacancy”_button|満マーク 満員 満室 満席 満車 ideograph no vacancy
🔴 red_circle|赤い丸 丸 丸いボタン 赤 geometric
🟠 orange_circle|オレンジの丸 オレンジ 丸 丸いボタン
🟡 yellow_circle|黄色い丸 丸 丸いボタン 黄色
🟢 green_circle|緑の丸 丸 丸いボタン 緑
🔵 blue_circle|青い丸 丸 丸いボタン 青 geometric
🟣 purple_circle|紫の丸 丸 丸いボタン 紫
🟤 brown_circle|茶色の丸 丸 丸いボタン 茶色
⚫ black_circle|黒い丸 丸 丸いボタン 黒 黒丸 geometric
⚪ white_circle|白い丸 丸 丸いボタン 白 geometric
🟥 red_square|赤い四角 四角 正方形 赤 card penalty
🟧 orange_square|オレンジの四角 オレンジ 四角 正方形
🟨 yellow_square|黄色い四角 四角 正方形 黄色 card penalty
🟩 green_square|緑の四角 四角 正方形 緑
🟦 blue_square|青い四角 四角 正方形 青
🟪 purple_square|紫の四角 四角 正方形 紫
🟫 brown_square|茶色い四角 四角 正方形 茶色
⬛ black_large_square|黒四角特大 四角 正方形 黒 geometric
⬜ white_large_square|白四角特大 四角 正方形 白 geometric
◼️ black_medium_square|黒四角大 四角 正方形 黒 geometric
◻️ white_medium_square|白四角大 四角 正方形 白 geometric
◾ black_medium-small_square|黒四角中 四角 正方形 黒 geometric
◽ white_medium-small_square|白四角中 四角 正方形 白 geometric
▪️ black_small_square|黒四角小 四角 正方形 黒 geometric
▫️ white_small_square|白四角小 四角 正方形 白 geometric
🔶 large_orange_diamond|大きいオレンジのひし形 オレンジ ダイア ダイヤ ひし形 四角 geometric
🔷 large_blue_diamond|大きい青のひし形 ダイア ダイヤ ひし形 四角 青 geometric
🔸 small_orange_diamond|小さいオレンジのひし形 オレンジ ダイア ダイヤ ひし形 四角 geometric
🔹 small_blue_diamond|小さい青のひし形 ダイア ダイヤ ひし形 四角 青 geometric
🔺 red_triangle_pointed_up|赤い上三角 三角 上 赤 geometric
🔻 red_triangle_pointed_down|赤い下三角 三角 下 赤 geometric
💠 diamond_with_a_dot|ドット付きひし形 ダイア ダイヤ ひし形 comic geometric
🔘 radio_button|ラジオボタン ボタン 二重丸 geometric
🔳 white_square_button|白枠四角 ボタン 四角ボタン 正方形 geometric outlined
🔲 black_square_button|黒枠四角 ボタン 四角ボタン 正方形 geometric
🏁 chequered_flag|チェッカーフラッグ スポーツ フラグ フラッグ レーシング レース 勝利 旗 checkered finish flags game race racing sport win
🚩 triangular_flag|三角の旗 ゴルフ スポーツ フラグ フラッグ 建築 旗 construction golf post
🎌 crossed_flags|祝日の旗 フラグ フラッグ 交差した旗 旗 日の丸 日本 祝日 celebration cross japanese
🏴 black_flag|黒旗 フラグ フラッグ 旗 黒 waving
🏳️ white_flag|白旗 フラグ フラッグ 旗 白 waving
🏳️‍🌈 rainbow_flag|レインボーフラッグ glbt lgbt lgbtq lgbtqia ゲイ トランスジェンダー バイセクシュアル プライド フラグ レズビアン 虹色の旗 bisexual gay genderqueer glbtq lesbian pride queer trans transgender
🏳️‍⚧️ transgender_flag|トランスジェンダーフラッグ lgbt tg トランスジェンダー フラグ フラッグ 旗 blue light pink white
🏴‍☠️ pirate_flag|海賊旗 ジョリー・ロジャー 宝物 海賊 略奪 jolly plunder roger treasure
🇦🇨 flag_ascension_island|旗_アセンション島 旗
🇦🇩 flag_andorra|旗_アンドラ 旗
🇦🇪 flag_united_arab_emirates|旗_アラブ首長国連邦 旗
🇦🇫 flag_afghanistan|旗_アフガニスタン 旗
🇦🇬 flag_antigua_&_barbuda|旗_アンティグア・バーブーダ 旗
🇦🇮 flag_anguilla|旗_アンギラ 旗
🇦🇱 flag_albania|旗_アルバニア 旗
🇦🇲 flag_armenia|旗_アルメニア 旗
🇦🇴 flag_angola|旗_アンゴラ 旗
🇦🇶 flag_antarctica|旗_南極 旗
🇦🇷 flag_argentina|旗_アルゼンチン 旗
🇦🇸 flag_american_samoa|旗_米領サモア 旗
🇦🇹 flag_austria|旗_オーストリア 旗
🇦🇺 flag_australia|旗_オーストラリア 旗
🇦🇼 flag_aruba|旗_アルバ 旗
🇦🇽 flag_åland_islands|旗_オーランド諸島 旗
🇦🇿 flag_azerbaijan|旗_アゼルバイジャン 旗
🇧🇦 flag_bosnia_&_herzegovina|旗_ボスニア・ヘルツェゴビナ 旗
🇧🇧 flag_barbados|旗_バルバドス 旗
🇧🇩 flag_bangladesh|旗_バングラデシュ 旗
🇧🇪 flag_belgium|旗_ベルギー 旗
🇧🇫 flag_burkina_faso|旗_ブルキナファソ 旗
🇧🇬 flag_bulgaria|旗_ブルガリア 旗
🇧🇭 flag_bahrain|旗_バーレーン 旗
🇧🇮 flag_burundi|旗_ブルンジ 旗
🇧🇯 flag_benin|旗_ベナン 旗
🇧🇱 flag_st._barthélemy|旗_サン・バルテルミー 旗
🇧🇲 flag_bermuda|旗_バミューダ 旗
🇧🇳 flag_brunei|旗_ブルネイ 旗
🇧🇴 flag_bolivia|旗_ボリビア 旗
🇧🇶 flag_caribbean_netherlands|旗_オランダ領カリブ 旗
🇧🇷 flag_brazil|旗_ブラジル 旗
🇧🇸 flag_bahamas|旗_バハマ 旗
🇧🇹 flag_bhutan|旗_ブータン 旗
🇧🇻 flag_bouvet_island|旗_ブーベ島 旗
🇧🇼 flag_botswana|旗_ボツワナ 旗
🇧🇾 flag_belarus|旗_ベラルーシ 旗
🇧🇿 flag_belize|旗_ベリーズ 旗
🇨🇦 flag_canada|旗_カナダ 旗
🇨🇨 flag_cocos_(keeling)_islands|旗_ココス(キーリング)諸島 旗
🇨🇩 flag_congo_-_kinshasa|旗_コンゴ民主共和国(キンシャサ) 旗
🇨🇫 flag_central_african_republic|旗_中央アフリカ共和国 旗
🇨🇬 flag_congo_-_brazzaville|旗_コンゴ共和国(ブラザビル) 旗
🇨🇭 flag_switzerland|旗_スイス 旗
🇨🇮 flag_côte_d’ivoire|旗_コートジボワール 旗
🇨🇰 flag_cook_islands|旗_クック諸島 旗
🇨🇱 flag_chile|旗_チリ 旗
🇨🇲 flag_cameroon|旗_カメルーン 旗
🇨🇳 flag_china|旗_中国 旗
🇨🇴 flag_colombia|旗_コロンビア 旗
🇨🇵 flag_clipperton_island|旗_クリッパートン島 旗
🇨🇶 flag_sark|旗_サーク島 旗
🇨🇷 flag_costa_rica|旗_コスタリカ 旗
🇨🇺 flag_cuba|旗_キューバ 旗
🇨🇻 flag_cape_verde|旗_カーボベルデ 旗
🇨🇼 flag_curaçao|旗_キュラソー 旗
🇨🇽 flag_christmas_island|旗_クリスマス島 旗
🇨🇾 flag_cyprus|旗_キプロス 旗
🇨🇿 flag_czechia|旗_チェコ 旗
🇩🇪 flag_germany|旗_ドイツ 旗
🇩🇬 flag_diego_garcia|旗_ディエゴガルシア島 旗
🇩🇯 flag_djibouti|旗_ジブチ 旗
🇩🇰 flag_denmark|旗_デンマーク 旗
🇩🇲 flag_dominica|旗_ドミニカ国 旗
🇩🇴 flag_dominican_republic|旗_ドミニカ共和国 旗
🇩🇿 flag_algeria|旗_アルジェリア 旗
🇪🇦 flag_ceuta_&_melilla|旗_セウタ・メリリャ 旗
🇪🇨 flag_ecuador|旗_エクアドル 旗
🇪🇪 flag_estonia|旗_エストニア 旗
🇪🇬 flag_egypt|旗_エジプト 旗
🇪🇭 flag_western_sahara|旗_西サハラ 旗
🇪🇷 flag_eritrea|旗_エリトリア 旗
🇪🇸 flag_spain|旗_スペイン 旗
🇪🇹 flag_ethiopia|旗_エチオピア 旗
🇪🇺 flag_european_union|旗_欧州連合 旗
🇫🇮 flag_finland|旗_フィンランド 旗
🇫🇯 flag_fiji|旗_フィジー 旗
🇫🇰 flag_falkland_islands|旗_フォークランド諸島 旗
🇫🇲 flag_micronesia|旗_ミクロネシア連邦 旗
🇫🇴 flag_faroe_islands|旗_フェロー諸島 旗
🇫🇷 flag_france|旗_フランス 旗
🇬🇦 flag_gabon|旗_ガボン 旗
🇬🇧 flag_united_kingdom|旗_イギリス 旗
🇬🇩 flag_grenada|旗_グレナダ 旗
🇬🇪 flag_georgia|旗_ジョージア 旗
🇬🇫 flag_french_guiana|旗_仏領ギアナ 旗
🇬🇬 flag_guernsey|旗_ガーンジー 旗
🇬🇭 flag_ghana|旗_ガーナ 旗
🇬🇮 flag_gibraltar|旗_ジブラルタル 旗
🇬🇱 flag_greenland|旗_グリーンランド 旗
🇬🇲 flag_gambia|旗_ガンビア 旗
🇬🇳 flag_guinea|旗_ギニア 旗
🇬🇵 flag_guadeloupe|旗_グアドループ 旗
🇬🇶 flag_equatorial_guinea|旗_赤道ギニア 旗
🇬🇷 flag_greece|旗_ギリシャ 旗
🇬🇸 flag_south_georgia_&_south_sandwich_islands|旗_サウスジョージア・サウスサンドウィッチ諸島 旗
🇬🇹 flag_guatemala|旗_グアテマラ 旗
🇬🇺 flag_guam|旗_グアム 旗
🇬🇼 flag_guinea-bissau|旗_ギニアビサウ 旗
🇬🇾 flag_guyana|旗_ガイアナ 旗
🇭🇰 flag_hong_kong_sar_china|旗_中華人民共和国香港特別行政区 旗
🇭🇲 flag_heard_island_&_mcdonald_islands|旗_ハード島・マクドナルド諸島 旗
🇭🇳 flag_honduras|旗_ホンジュラス 旗
🇭🇷 flag_croatia|旗_クロアチア 旗
🇭🇹 flag_haiti|旗_ハイチ 旗
🇭🇺 flag_hungary|旗_ハンガリー 旗
🇮🇨 flag_canary_islands|旗_カナリア諸島 旗
🇮🇩 flag_indonesia|旗_インドネシア 旗
🇮🇪 flag_ireland|旗_アイルランド 旗
🇮🇱 flag_israel|旗_イスラエル 旗
🇮🇲 flag_isle_of_man|旗_マン島 旗
🇮🇳 flag_india|旗_インド 旗
🇮🇴 flag_british_indian_ocean_territory|旗_英領インド洋地域 旗
🇮🇶 flag_iraq|旗_イラク 旗
🇮🇷 flag_iran|旗_イラン 旗
🇮🇸 flag_iceland|旗_アイスランド 旗
🇮🇹 flag_italy|旗_イタリア 旗
🇯🇪 flag_jersey|旗_ジャージー 旗
🇯🇲 flag_jamaica|旗_ジャマイカ 旗
🇯🇴 flag_jordan|旗_ヨルダン 旗
🇯🇵 flag_japan|旗_日本 旗
🇰🇪 flag_kenya|旗_ケニア 旗
🇰🇬 flag_kyrgyzstan|旗_キルギス 旗
🇰🇭 flag_cambodia|旗_カンボジア 旗
🇰🇮 flag_kiribati|旗_キリバス 旗
🇰🇲 flag_comoros|旗_コモロ 旗
🇰🇳 flag_st._kitts_&_nevis|旗_セントクリストファー・ネーヴィス 旗
🇰🇵 flag_north_korea|旗_北朝鮮 旗
🇰🇷 flag_south_korea|旗_韓国 旗
🇰🇼 flag_kuwait|旗_クウェート 旗
🇰🇾 flag_cayman_islands|旗_ケイマン諸島 旗
🇰🇿 flag_kazakhstan|旗_カザフスタン 旗
🇱🇦 flag_laos|旗_ラオス 旗
🇱🇧 flag_lebanon|旗_レバノン 旗
🇱🇨 flag_st._lucia|旗_セントルシア 旗
🇱🇮 flag_liechtenstein|旗_リヒテンシュタイン 旗
🇱🇰 flag_sri_lanka|旗_スリランカ 旗
🇱🇷 flag_liberia|旗_リベリア 旗
🇱🇸 flag_lesotho|旗_レソト 旗
🇱🇹 flag_lithuania|旗_リトアニア 旗
🇱🇺 flag_luxembourg|旗_ルクセンブルク 旗
🇱🇻 flag_latvia|旗_ラトビア 旗
🇱🇾 flag_libya|旗_リビア 旗
🇲🇦 flag_morocco|旗_モロッコ 旗
🇲🇨 flag_monaco|旗_モナコ 旗
🇲🇩 flag_moldova|旗_モルドバ 旗
🇲🇪 flag_montenegro|旗_モンテネグロ 旗
🇲🇫 flag_st._martin|旗_サン・マルタン 旗
🇲🇬 flag_madagascar|旗_マダガスカル 旗
🇲🇭 flag_marshall_islands|旗_マーシャル諸島 旗
🇲🇰 flag_north_macedonia|旗_北マケドニア 旗
🇲🇱 flag_mali|旗_マリ 旗
🇲🇲 flag_myanmar_(burma)|旗_ミャンマー_(ビルマ) 旗
🇲🇳 flag_mongolia|旗_モンゴル 旗
🇲🇴 flag_macao_sar_china|旗_中華人民共和国マカオ特別行政区 旗
🇲🇵 flag_northern_mariana_islands|旗_北マリアナ諸島 旗
🇲🇶 flag_martinique|旗_マルティニーク 旗
🇲🇷 flag_mauritania|旗_モーリタニア 旗
🇲🇸 flag_montserrat|旗_モントセラト 旗
🇲🇹 flag_malta|旗_マルタ 旗
🇲🇺 flag_mauritius|旗_モーリシャス 旗
🇲🇻 flag_maldives|旗_モルディブ 旗
🇲🇼 flag_malawi|旗_マラウイ 旗
🇲🇽 flag_mexico|旗_メキシコ 旗
🇲🇾 flag_malaysia|旗_マレーシア 旗
🇲🇿 flag_mozambique|旗_モザンビーク 旗
🇳🇦 flag_namibia|旗_ナミビア 旗
🇳🇨 flag_new_caledonia|旗_ニューカレドニア 旗
🇳🇪 flag_niger|旗_ニジェール 旗
🇳🇫 flag_norfolk_island|旗_ノーフォーク島 旗
🇳🇬 flag_nigeria|旗_ナイジェリア 旗
🇳🇮 flag_nicaragua|旗_ニカラグア 旗
🇳🇱 flag_netherlands|旗_オランダ 旗
🇳🇴 flag_norway|旗_ノルウェー 旗
🇳🇵 flag_nepal|旗_ネパール 旗
🇳🇷 flag_nauru|旗_ナウル 旗
🇳🇺 flag_niue|旗_ニウエ 旗
🇳🇿 flag_new_zealand|旗_ニュージーランド 旗
🇴🇲 flag_oman|旗_オマーン 旗
🇵🇦 flag_panama|旗_パナマ 旗
🇵🇪 flag_peru|旗_ペルー 旗
🇵🇫 flag_french_polynesia|旗_仏領ポリネシア 旗
🇵🇬 flag_papua_new_guinea|旗_パプアニューギニア 旗
🇵🇭 flag_philippines|旗_フィリピン 旗
🇵🇰 flag_pakistan|旗_パキスタン 旗
🇵🇱 flag_poland|旗_ポーランド 旗
🇵🇲 flag_st._pierre_&_miquelon|旗_サンピエール島・ミクロン島 旗
🇵🇳 flag_pitcairn_islands|旗_ピトケアン諸島 旗
🇵🇷 flag_puerto_rico|旗_プエルトリコ 旗
🇵🇸 flag_palestinian_territories|旗_パレスチナ自治区 旗
🇵🇹 flag_portugal|旗_ポルトガル 旗
🇵🇼 flag_palau|旗_パラオ 旗
🇵🇾 flag_paraguay|旗_パラグアイ 旗
🇶🇦 flag_qatar|旗_カタール 旗
🇷🇪 flag_réunion|旗_レユニオン 旗
🇷🇴 flag_romania|旗_ルーマニア 旗
🇷🇸 flag_serbia|旗_セルビア 旗
🇷🇺 flag_russia|旗_ロシア 旗
🇷🇼 flag_rwanda|旗_ルワンダ 旗
🇸🇦 flag_saudi_arabia|旗_サウジアラビア 旗
🇸🇧 flag_solomon_islands|旗_ソロモン諸島 旗
🇸🇨 flag_seychelles|旗_セーシェル 旗
🇸🇩 flag_sudan|旗_スーダン 旗
🇸🇪 flag_sweden|旗_スウェーデン 旗
🇸🇬 flag_singapore|旗_シンガポール 旗
🇸🇭 flag_st._helena,_ascension_&_tristan_da_cunha|旗_セントヘレナ 旗
🇸🇮 flag_slovenia|旗_スロベニア 旗
🇸🇯 flag_svalbard_&_jan_mayen|旗_スバールバル諸島・ヤンマイエン島 旗
🇸🇰 flag_slovakia|旗_スロバキア 旗
🇸🇱 flag_sierra_leone|旗_シエラレオネ 旗
🇸🇲 flag_san_marino|旗_サンマリノ 旗
🇸🇳 flag_senegal|旗_セネガル 旗
🇸🇴 flag_somalia|旗_ソマリア 旗
🇸🇷 flag_suriname|旗_スリナム 旗
🇸🇸 flag_south_sudan|旗_南スーダン 旗
🇸🇹 flag_são_tomé_&_príncipe|旗_サントメ・プリンシペ 旗
🇸🇻 flag_el_salvador|旗_エルサルバドル 旗
🇸🇽 flag_sint_maarten|旗_シント・マールテン 旗
🇸🇾 flag_syria|旗_シリア 旗
🇸🇿 flag_eswatini|旗_エスワティニ 旗
🇹🇦 flag_tristan_da_cunha|旗_トリスタン・ダ・クーニャ 旗
🇹🇨 flag_turks_&_caicos_islands|旗_タークス・カイコス諸島 旗
🇹🇩 flag_chad|旗_チャド 旗
🇹🇫 flag_french_southern_and_antarctic_lands|旗_仏領極南諸島 旗
🇹🇬 flag_togo|旗_トーゴ 旗
🇹🇭 flag_thailand|旗_タイ 旗
🇹🇯 flag_tajikistan|旗_タジキスタン 旗
🇹🇰 flag_tokelau|旗_トケラウ 旗
🇹🇱 flag_timor-leste|旗_東ティモール 旗
🇹🇲 flag_turkmenistan|旗_トルクメニスタン 旗
🇹🇳 flag_tunisia|旗_チュニジア 旗
🇹🇴 flag_tonga|旗_トンガ 旗
🇹🇷 flag_türkiye|旗_トルコ 旗
🇹🇹 flag_trinidad_&_tobago|旗_トリニダード・トバゴ 旗
🇹🇻 flag_tuvalu|旗_ツバル 旗
🇹🇼 flag_taiwan|旗_台湾 旗
🇹🇿 flag_tanzania|旗_タンザニア 旗
🇺🇦 flag_ukraine|旗_ウクライナ 旗
🇺🇬 flag_uganda|旗_ウガンダ 旗
🇺🇲 flag_u.s._outlying_islands|旗_合衆国領有小離島 旗
🇺🇳 flag_united_nations|旗_国際連合 旗
🇺🇸 flag_united_states|旗_アメリカ合衆国 旗
🇺🇾 flag_uruguay|旗_ウルグアイ 旗
🇺🇿 flag_uzbekistan|旗_ウズベキスタン 旗
🇻🇦 flag_vatican_city|旗_バチカン市国 旗
🇻🇨 flag_st._vincent_&_grenadines|旗_セントビンセント及びグレナディーン諸島 旗
🇻🇪 flag_venezuela|旗_ベネズエラ 旗
🇻🇬 flag_british_virgin_islands|旗_英領ヴァージン諸島 旗
🇻🇮 flag_u.s._virgin_islands|旗_米領ヴァージン諸島 旗
🇻🇳 flag_vietnam|旗_ベトナム 旗
🇻🇺 flag_vanuatu|旗_バヌアツ 旗
🇼🇫 flag_wallis_&_futuna|旗_ウォリス・フツナ 旗
🇼🇸 flag_samoa|旗_サモア 旗
🇽🇰 flag_kosovo|旗_コソボ 旗
🇾🇪 flag_yemen|旗_イエメン 旗
🇾🇹 flag_mayotte|旗_マヨット 旗
🇿🇦 flag_south_africa|旗_南アフリカ 旗
🇿🇲 flag_zambia|旗_ザンビア 旗
🇿🇼 flag_zimbabwe|旗_ジンバブエ 旗
🏴󠁧󠁢󠁥󠁮󠁧󠁿 flag_england|旗_イングランド 旗
🏴󠁧󠁢󠁳󠁣󠁴󠁿 flag_scotland|旗_スコットランド 旗
🏴󠁧󠁢󠁷󠁬󠁳󠁿 flag_wales|旗_ウェールズ 旗
`;
