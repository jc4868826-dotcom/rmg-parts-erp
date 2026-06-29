import { useState, useMemo } from "react";

// ─── datos reales del inventario (223 SKUs) ───────────────────────────────────
const SKU_DATA = [{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"240272","descripcion":"31X10.5 R15 KL71 109Q K","costo":115417,"precio_b2b":143117,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"240276","descripcion":"215/75 R15 KL71 106Q 8PR K","costo":114425,"precio_b2b":141887,"stock":6,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"240079","descripcion":"30X9.5 R15 KL71 104Q 6PR K","costo":96087,"precio_b2b":119147,"stock":61,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"240331","descripcion":"27X8.5 R14 KL71 6PR K","costo":80656,"precio_b2b":100013,"stock":7,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244243","descripcion":"225/60 R16 KR26 98H K","costo":59516,"precio_b2b":73800,"stock":8,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244248","descripcion":"215/70 R16 KC53 108T 6PR K","costo":83348,"precio_b2b":103352,"stock":66,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"240497","descripcion":"235/60 R17 KL33 102V 4PR K","costo":93905,"precio_b2b":116443,"stock":13,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"240450","descripcion":"155/70 R13 KR26 75H 4PR K","costo":30583,"precio_b2b":37923,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244256","descripcion":"235/60 R16 PA31 100V 4PR","costo":70343,"precio_b2b":87225,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"241237","descripcion":"195/60 R16 KC53 99H K","costo":61415,"precio_b2b":76154,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244306","descripcion":"245/75 R16 AT51 109T","costo":86609,"precio_b2b":107395,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244395","descripcion":"225/60 R16 KH27 98V VT","costo":59581,"precio_b2b":73881,"stock":15,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244402","descripcion":"265/75 R16 AT51 123R TL VT","costo":124050,"precio_b2b":153822,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244411","descripcion":"295/80 R22.5 RS15 152M","costo":319577,"precio_b2b":396275,"stock":20,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244412","descripcion":"195/75 R16 KC53 110R 10PR K","costo":82903,"precio_b2b":102799,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244420","descripcion":"195/60 R16 PA31 89V 4PR","costo":53126,"precio_b2b":65876,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244313","descripcion":"215/60 R16 KC53 103T 6PR VT","costo":77035,"precio_b2b":95523,"stock":50,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244325","descripcion":"265/70 R18 KL21 114T KUMHO VT","costo":87101,"precio_b2b":108005,"stock":44,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244340","descripcion":"205/65 R15 KC53 104S K","costo":73246,"precio_b2b":90825,"stock":50,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244345","descripcion":"265/50 R20 KL21 107V VT","costo":123199,"precio_b2b":152767,"stock":14,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244348","descripcion":"225/70 R16 KH27 103H CH","costo":66669,"precio_b2b":82669,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244359","descripcion":"155/65 R14 ES31 75T 4PR TL","costo":25091,"precio_b2b":31113,"stock":21,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244361","descripcion":"195/65 R15 ES31 4PR TL CH","costo":48292,"precio_b2b":59882,"stock":11,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244363","descripcion":"245/75 R16 MT51 120/116Q 10PR VT TL","costo":120884,"precio_b2b":149896,"stock":47,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244365","descripcion":"245/75 R16 AT52 111T","costo":97312,"precio_b2b":120667,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244370","descripcion":"215/55 R18 KL33 93V K","costo":100116,"precio_b2b":124144,"stock":48,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244374","descripcion":"275/60 R20 AT51 102T VT","costo":157951,"precio_b2b":195859,"stock":145,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244383","descripcion":"175/70 R14 ES31 84T","costo":37818,"precio_b2b":46894,"stock":15,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244387","descripcion":"165/65 R14 ES31 79T","costo":34937,"precio_b2b":43322,"stock":8,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244388","descripcion":"205/45 ZR17 HS51 88W","costo":51467,"precio_b2b":63819,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244426","descripcion":"185/55 R14 KH27 80H K","costo":33638,"precio_b2b":41711,"stock":26,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244380","descripcion":"265/65 R18 AT51 114T","costo":115535,"precio_b2b":143263,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244009","descripcion":"285/50 R20 HP71 116V KR","costo":159383,"precio_b2b":197634,"stock":59,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244503","descripcion":"195/50 R15 KH27","costo":40888,"precio_b2b":50701,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244650","descripcion":"255/60 R18 AT52 112T","costo":110104,"precio_b2b":136529,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244600","descripcion":"215/70 R16 HP71 104H 4PR","costo":76683,"precio_b2b":95087,"stock":15,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244607","descripcion":"255/50 R20 HP71 105H","costo":136961,"precio_b2b":169832,"stock":14,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244642","descripcion":"215/55 R18 PA31 95V","costo":73175,"precio_b2b":90737,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244646","descripcion":"27X8.50 R14 AT51 101R 8PR","costo":74560,"precio_b2b":92454,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244625","descripcion":"225/55 R17 PS71 97Y 4PR","costo":117252,"precio_b2b":145393,"stock":8,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244626","descripcion":"295/80 R22.5 MA03 152/148M 16PR","costo":339384,"precio_b2b":420836,"stock":36,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244627","descripcion":"195/75 R14 KC53 106R 8PR","costo":62559,"precio_b2b":77573,"stock":9,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244628","descripcion":"215/45 R16 HS51 90V 4PR","costo":56028,"precio_b2b":69474,"stock":20,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244631","descripcion":"195/45 R16 PS31 84V","costo":48521,"precio_b2b":60166,"stock":26,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244610","descripcion":"295/80 R22.5 MD41 16PR 152/148K","costo":306045,"precio_b2b":379495,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244614","descripcion":"225/55 R16 PA31 99V","costo":68821,"precio_b2b":85338,"stock":15,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"242056X","descripcion":"205/65 R16 KH17 95H 4PR K","costo":111537,"precio_b2b":138306,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244679","descripcion":"285/45 R22 HP71","costo":141769,"precio_b2b":175794,"stock":5,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244635","descripcion":"245/75 R16 AT52 111S 10PR","costo":124949,"precio_b2b":154937,"stock":70,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244726","descripcion":"275/65 R18 HT51 123/120R 10PR","costo":139611,"precio_b2b":173117,"stock":54,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244736","descripcion":"155/55 R14 HS51 69V 4PR","costo":28068,"precio_b2b":34804,"stock":30,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244738","descripcion":"255/55 R18 PS71 100Y","costo":95629,"precio_b2b":118580,"stock":10,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244664","descripcion":"195/55 R16 KH27 87H","costo":47891,"precio_b2b":59384,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244743","descripcion":"225/60 R16 HS52 98W","costo":58704,"precio_b2b":72793,"stock":28,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244761","descripcion":"185/60 R14 KH27 82H","costo":33176,"precio_b2b":41138,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244762","descripcion":"275/60 R20 AT52 115T","costo":144180,"precio_b2b":178783,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244775","descripcion":"225/50 R17 TA21 94V","costo":62342,"precio_b2b":77305,"stock":8,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244779","descripcion":"285/60 R20 AT52 125S","costo":146031,"precio_b2b":181079,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244781","descripcion":"265/75 R16 HT51 114T","costo":119471,"precio_b2b":148144,"stock":28,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244783","descripcion":"275/70 R18 AT52","costo":164468,"precio_b2b":203940,"stock":30,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244448","descripcion":"225/40 R18 PS71 92Y","costo":85925,"precio_b2b":106547,"stock":42,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244784","descripcion":"165/70 R14 KC53 89/87R","costo":50872,"precio_b2b":63081,"stock":42,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244451","descripcion":"235/55 R20 HP71 102H","costo":125572,"precio_b2b":155709,"stock":10,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KUMHO","codigo":"244788","descripcion":"265/60 R18 HP71 110V","costo":140363,"precio_b2b":174050,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KENDA SD","codigo":"270016","descripcion":"195/75 R14 KR06 106/104R 6PR CH","costo":57983,"precio_b2b":71900,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KENDA SD","codigo":"270005","descripcion":"265/65 R18 KR15 114T TL CH","costo":48724,"precio_b2b":60418,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KENDA SD","codigo":"270048","descripcion":"265/70 R17 KR28 115S TL TW","costo":120082,"precio_b2b":148901,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KENDA SD","codigo":"270069","descripcion":"30X9.5 R15 KR28 104Q TW","costo":109170,"precio_b2b":135371,"stock":7,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KENDA SD","codigo":"270078","descripcion":"31X10.5 R15 KR29 109Q 6PR CH","costo":115116,"precio_b2b":142744,"stock":22,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KENDA SD","codigo":"270221","descripcion":"205/45 R17 KR32 88V TL","costo":55810,"precio_b2b":69205,"stock":6,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KENDA SD","codigo":"270823","descripcion":"225/55 R16 KR10 95V TL","costo":60909,"precio_b2b":75528,"stock":6,"margen_pct":24},{"linea":"NEUMATICOS","marca":"KENDA SD","codigo":"270221X","descripcion":"205/45 R17 KR32 88V TL","costo":62011,"precio_b2b":76893,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210101","descripcion":"225/60 R17 W01 99T","costo":56238,"precio_b2b":69735,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210114","descripcion":"215/75 R15 W01 100/97R","costo":51735,"precio_b2b":64152,"stock":23,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210115","descripcion":"255/70 R16 W01 108/104R","costo":80560,"precio_b2b":99894,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210119","descripcion":"215/75 R17.5 DSRS01 126/124L 16PR","costo":81233,"precio_b2b":100729,"stock":20,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210103","descripcion":"245/70 R16 W01 113/110Q","costo":65589,"precio_b2b":81331,"stock":29,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210111","descripcion":"265/70 R17 DS01 115H","costo":77268,"precio_b2b":95812,"stock":42,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210105","descripcion":"175/70 R13 DH05 82T","costo":22139,"precio_b2b":27452,"stock":68,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210104","descripcion":"265/70 R16 DS01 112H","costo":66053,"precio_b2b":81906,"stock":79,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210118","descripcion":"1200 R24 DSR168 160/157L 20PR","costo":271616,"precio_b2b":336804,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210108","descripcion":"185/60 R15 DH05 84H","costo":29387,"precio_b2b":36440,"stock":160,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210016","descripcion":"185/65 R15 DH05 88H","costo":26089,"precio_b2b":32351,"stock":192,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210017","descripcion":"155 R12 DS805 88N","costo":27190,"precio_b2b":33716,"stock":34,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210018","descripcion":"185/65 R14 DH05 86H","costo":25586,"precio_b2b":31727,"stock":170,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210019","descripcion":"175/70 R14 DH05 84T","costo":23644,"precio_b2b":29319,"stock":35,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210020","descripcion":"175/65 R14 DH05 82H","costo":23060,"precio_b2b":28594,"stock":14,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210021","descripcion":"235/65 R16 DLA02 115/113R","costo":59507,"precio_b2b":73789,"stock":2,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210022","descripcion":"235/75 R15 T01 110N","costo":95752,"precio_b2b":118732,"stock":7,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210023","descripcion":"195 R15 DL01 106/104Q","costo":49950,"precio_b2b":61937,"stock":7,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210025","descripcion":"265/65 R18 DSS02 114T","costo":71004,"precio_b2b":88045,"stock":33,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210026","descripcion":"245/75 R16 W01 114/111R 8PR","costo":69607,"precio_b2b":86313,"stock":79,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210126","descripcion":"315/80 R22.5 DSR668 156/150L 20PR","costo":217717,"precio_b2b":269969,"stock":5,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210024","descripcion":"265/70 R17 DS01 115H","costo":74194,"precio_b2b":92000,"stock":9,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210027","descripcion":"225/75 R16 W01 103/100Q 6PR","costo":59732,"precio_b2b":74068,"stock":13,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210028","descripcion":"235/60 R17 DS01 102H","costo":52483,"precio_b2b":65079,"stock":16,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210029","descripcion":"235/60 R16 DS01 100H","costo":42826,"precio_b2b":53104,"stock":21,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210031","descripcion":"215/75 R17.5 DSR116 126/124L 16PR","costo":82453,"precio_b2b":102242,"stock":21,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210032","descripcion":"12 R22.5 DSR168 152/149L 18PR","costo":148075,"precio_b2b":183613,"stock":16,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210033","descripcion":"11 R22.5 DSR168 148/145L 16PR","costo":172646,"precio_b2b":214081,"stock":205,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210034","descripcion":"295/80 R22.5 DSR668 152/149J 18PR","costo":183597,"precio_b2b":227661,"stock":140,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210035","descripcion":"295/80 R22.5 DSR328 154/152M 18PR","costo":160739,"precio_b2b":199316,"stock":44,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210037","descripcion":"215/70 R15C DL01 109/107R","costo":54279,"precio_b2b":67306,"stock":6,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210039","descripcion":"275/65 R18 DSS02 116T","costo":83357,"precio_b2b":103363,"stock":20,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210042","descripcion":"195/60 R15 DH05 88V","costo":29125,"precio_b2b":36115,"stock":32,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210044","descripcion":"265/65 R17 W01 120/117R 10PR","costo":76269,"precio_b2b":94574,"stock":50,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210045","descripcion":"235/75 R15 W01 110/107R 8PR","costo":69700,"precio_b2b":86428,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210046","descripcion":"265/70 R16 W01 110/107R 6PR","costo":83091,"precio_b2b":103033,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210050","descripcion":"235/60 R18 W01 103Q","costo":57004,"precio_b2b":70685,"stock":17,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210051","descripcion":"205/60 R16 DH05 92H","costo":32553,"precio_b2b":40366,"stock":218,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210052","descripcion":"12 R22.5 DSR668 152/149K 18PR","costo":209994,"precio_b2b":260393,"stock":16,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210054","descripcion":"11 R22.5 DSR116 146/143L 16PR","costo":159203,"precio_b2b":197411,"stock":12,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210059","descripcion":"31/10.5 R15 T01 109N","costo":101071,"precio_b2b":125328,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210061","descripcion":"195/55 R16 DH05 87V","costo":29682,"precio_b2b":36805,"stock":51,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210062","descripcion":"275/65 R18 DLA01 116T","costo":67740,"precio_b2b":83998,"stock":6,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210063","descripcion":"265/60 R18 W01 110T","costo":71129,"precio_b2b":88200,"stock":24,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210064","descripcion":"205/65 R16 DH09 95H","costo":34900,"precio_b2b":43276,"stock":24,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210065","descripcion":"265/50 R20 DSU02 111W","costo":57610,"precio_b2b":71436,"stock":12,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210067","descripcion":"295/80 R22.5 DSR266 154/152M 18PR","costo":147103,"precio_b2b":182408,"stock":17,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210068","descripcion":"215/65 R16 DH08 98H","costo":40538,"precio_b2b":50267,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210069","descripcion":"205/55 R16 DH05 91V","costo":29248,"precio_b2b":36268,"stock":83,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210072","descripcion":"215/55 R18 DS01 98H","costo":45413,"precio_b2b":56312,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210074","descripcion":"255/55 R18 DSU02 105V","costo":44286,"precio_b2b":54914,"stock":4,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210076","descripcion":"165/65 R14 DH05 79T","costo":24410,"precio_b2b":30269,"stock":9,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210078","descripcion":"235/55 R19 DSU02 105V","costo":49643,"precio_b2b":61557,"stock":20,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210079","descripcion":"285/50 R20 DS01 112H","costo":67433,"precio_b2b":83617,"stock":49,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210082","descripcion":"13 R22.5 DSR168 154/150K 18PR","costo":194456,"precio_b2b":241125,"stock":9,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210084","descripcion":"215/70 R16 DS01 108/106R","costo":51450,"precio_b2b":63798,"stock":86,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210085","descripcion":"235/55 R18 DS01 100V","costo":47387,"precio_b2b":58759,"stock":10,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210088","descripcion":"295/80 R22.5 DSRT26 154/152M 18PR","costo":170185,"precio_b2b":211029,"stock":3,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210097","descripcion":"11 R22.5 DSR668 148/145J 16PR","costo":191440,"precio_b2b":237386,"stock":253,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210098","descripcion":"215/75 R17.5 DSRD01 126/124L 16PR","costo":82739,"precio_b2b":102596,"stock":15,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210113","descripcion":"12 R22.5 HD636Z 152/149L 18PR","costo":201376,"precio_b2b":249706,"stock":18,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210122","descripcion":"155/65 R13 DH05","costo":16999,"precio_b2b":21078,"stock":6,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210123","descripcion":"245/75 R16 T01 114/111N 8PR","costo":92228,"precio_b2b":114363,"stock":74,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210124","descripcion":"165/65 R13 DH05 77T","costo":23133,"precio_b2b":28685,"stock":11,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210125","descripcion":"155/65 R14 DH08 75T","costo":22377,"precio_b2b":27748,"stock":36,"margen_pct":24},{"linea":"NEUMATICOS","marca":"DOUBLE STAR","codigo":"210127","descripcion":"215/65 R16 DH03 98H","costo":35352,"precio_b2b":43836,"stock":24,"margen_pct":24},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"351416","descripcion":"BATERIA YOKO KR 40AMP N40L","costo":35579,"precio_b2b":46964,"stock":148,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"351442","descripcion":"BATERIA YOKO KR 90AMP 30H730 (30-H90)","costo":74583,"precio_b2b":98450,"stock":32,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"351435","descripcion":"N70Z MF","costo":66957,"precio_b2b":88383,"stock":164,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"351433","descripcion":"BATERIA YOKO KR 75AMP 75DT660","costo":62899,"precio_b2b":83026,"stock":52,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"351404","descripcion":"BATERIA YOKO KR 12N24-4 26AMP","costo":30216,"precio_b2b":39885,"stock":213,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352425","descripcion":"BATERIA YOKO KR 60AMP N50Z","costo":51459,"precio_b2b":67926,"stock":15,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352430","descripcion":"BATERIA YOKO KR 70AMP N70","costo":61769,"precio_b2b":81535,"stock":42,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352432","descripcion":"BATERIA YOKO KR 75AMP N70Z","costo":67808,"precio_b2b":89507,"stock":58,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352440","descripcion":"BATERIA YOKO KR 100AMP N100L","costo":79501,"precio_b2b":104942,"stock":39,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352445","descripcion":"BATERIA YOKO KR 120AMP N120","costo":100573,"precio_b2b":132757,"stock":61,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352450","descripcion":"BATERIA YOKO KR 150AMP N150","costo":129164,"precio_b2b":170497,"stock":65,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352414","descripcion":"BATERIA KOREA KR 40AMP N40","costo":37314,"precio_b2b":49255,"stock":173,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352410","descripcion":"BATERIA YOKO KR 35AMP NS40ZL","costo":31311,"precio_b2b":41330,"stock":370,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352417","descripcion":"BATERIA YOKO KR 45AMP NS60L","costo":43907,"precio_b2b":57957,"stock":132,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352465","descripcion":"BATERIA YOKO KR 200AMP N200","costo":170704,"precio_b2b":225329,"stock":94,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352420","descripcion":"BATERIA YOKO KR 55AMP 55559","costo":48450,"precio_b2b":63955,"stock":408,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352421","descripcion":"BATERIA YOKO KR 44AMP 54459","costo":44989,"precio_b2b":59385,"stock":270,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352466","descripcion":"BATERIA YOKO KR 55AMP 55565","costo":44272,"precio_b2b":58439,"stock":74,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352437","descripcion":"BATERIA YOKO KR 88AMP 58827","costo":77449,"precio_b2b":102232,"stock":20,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352435","descripcion":"BATERIA YOKO KR 70AMP NX110-5","costo":60856,"precio_b2b":80329,"stock":61,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352438","descripcion":"BATERIA YOKO KR 90AMP NX120-7","costo":69715,"precio_b2b":92024,"stock":111,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352443","descripcion":"BATERIA YOKO KR 100AMP 30H102","costo":77672,"precio_b2b":102528,"stock":130,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352422","descripcion":"BATERIA YOKO KR 54AMP 55457A","costo":45561,"precio_b2b":60140,"stock":113,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352416","descripcion":"BATERIA YOKO KR 43AMP 54316","costo":40975,"precio_b2b":54087,"stock":3,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352434","descripcion":"BATERIA YOKO KR 71AMP 57113","costo":66666,"precio_b2b":87999,"stock":87,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352439","descripcion":"BATERIA YOKO KR 90AMP NX120-7L","costo":70842,"precio_b2b":93511,"stock":162,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352436","descripcion":"BATERIA YOKO KR 70AMP NX110-5L","costo":59235,"precio_b2b":78190,"stock":176,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352449","descripcion":"BATERIA YOKO KR 75AMP N70ZL","costo":66358,"precio_b2b":87592,"stock":19,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352433","descripcion":"BATERIA YOKO KR 78DT-760 760CCA 12V","costo":73109,"precio_b2b":96504,"stock":27,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352444","descripcion":"BATERIA YOKO KR 150AMP N150LSMF","costo":131282,"precio_b2b":173293,"stock":55,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352446","descripcion":"BATERIA YOKO KR 75DT-710 710CCA 12V","costo":64534,"precio_b2b":85184,"stock":55,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352424","descripcion":"BATERIA YOKO KR 60AMP 55D23R","costo":55034,"precio_b2b":72644,"stock":67,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352426","descripcion":"BATERIA YOKO KR 55D23L 60AMP/H 12V","costo":53440,"precio_b2b":70541,"stock":76,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352447","descripcion":"BATERIA YOKO KR 45AMP NX100-S6LS","costo":41703,"precio_b2b":55048,"stock":21,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352455","descripcion":"BATERIA YOKO KR 80 AMP 58014","costo":76600,"precio_b2b":101113,"stock":44,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352451","descripcion":"N100 100AMP 12VOLT","costo":84460,"precio_b2b":111488,"stock":120,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352452","descripcion":"BATERÍA YOKO KR SMF 60044 100AH 12V","costo":93677,"precio_b2b":123654,"stock":79,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352453","descripcion":"73011SHD SMF 230AMP","costo":226551,"precio_b2b":299047,"stock":53,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352454","descripcion":"68032 SMF 12V 180 A/H","costo":165757,"precio_b2b":218799,"stock":12,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352456","descripcion":"BATERIA YOKO KR 100AMP 31-930S","costo":94609,"precio_b2b":124884,"stock":3,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352467","descripcion":"BATERIA YOKO KR 55AMP 55559 SMF","costo":45310,"precio_b2b":59809,"stock":55,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352469","descripcion":"BATERIA YOKO SMF 53529","costo":41553,"precio_b2b":54850,"stock":11,"margen_pct":32},{"linea":"BATERIAS","marca":"YOKO G&B","codigo":"352460","descripcion":"SMF 56219 62AMP CCA510","costo":47168,"precio_b2b":62261,"stock":21,"margen_pct":32},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000001","descripcion":"AUSTER MAXTECH PRO RX 5W30 SP/CJ 1 LT","costo":3116,"precio_b2b":4176,"stock":1613,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000002","descripcion":"AUSTER MAXTECH PRO FE 5W30 SP/CF C3 DPF 1L","costo":2994,"precio_b2b":4011,"stock":18,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000006","descripcion":"AUSTER MAXFORCE 15W40 CK-4 1L","costo":3385,"precio_b2b":4536,"stock":1813,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000007","descripcion":"AUSTER MAXFORCE 15W40 CK-4 3L","costo":3576,"precio_b2b":4792,"stock":99,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000011","descripcion":"AUSTER MAXFORCE 10W40 CK-4 3L","costo":4085,"precio_b2b":5474,"stock":374,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000012","descripcion":"AUSTER MAXFORCE 10W40 CK-4 20L","costo":3655,"precio_b2b":4897,"stock":1560,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000003","descripcion":"AUSTER MAXTECH PRO FE 5W30 ACEA C3 DPF 1L","costo":3143,"precio_b2b":4211,"stock":2567,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000010","descripcion":"AUSTER MAXFORCE 10W40 CK-4 1L","costo":3746,"precio_b2b":5020,"stock":1241,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000019","descripcion":"AUSTER 75W90 GL-4 1L","costo":2878,"precio_b2b":3856,"stock":174,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000022","descripcion":"AUSTER 75W90 GL-5 1L","costo":3108,"precio_b2b":4165,"stock":270,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000026","descripcion":"AUSTER 80W90 GL-4 1L","costo":2529,"precio_b2b":3388,"stock":600,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000028","descripcion":"AUSTER TRANSMISSION 80W90 GL-5 1L","costo":2759,"precio_b2b":3697,"stock":1407,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000029","descripcion":"AUSTER 80W90 GL-5 20L","costo":43088,"precio_b2b":57738,"stock":73,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000030","descripcion":"AUSTER 80W90 GL-5 200L","costo":425726,"precio_b2b":570472,"stock":3,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000034","descripcion":"AUSTER ATF VI 1L","costo":5223,"precio_b2b":6999,"stock":20,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000035","descripcion":"AUSTER 4T 10W40 1L","costo":2603,"precio_b2b":3488,"stock":386,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000036","descripcion":"AUSTER LONG LIFE ANTIFREEZE 1L","costo":2811,"precio_b2b":3767,"stock":387,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000038","descripcion":"AUSTER LONG LIFE ANTIFREEZE 200L","costo":393544,"precio_b2b":527349,"stock":5,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000039","descripcion":"AUSTER MAXTECHG PRO FE 0W30 SN/CF 1L","costo":3986,"precio_b2b":5341,"stock":164,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000040","descripcion":"AUSTER MAXTECH PRO FE 0W30 SN/CF 4L","costo":12189,"precio_b2b":16334,"stock":121,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000044","descripcion":"AUSTER 20W50 SL/CF 4L","costo":9354,"precio_b2b":12534,"stock":273,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000046","descripcion":"AUSTER MAXFORCE 15W40 CK-4 6L","costo":18330,"precio_b2b":24562,"stock":832,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000047","descripcion":"AUSTER MAXFORCE 10W40 CK-4 6L","costo":19625,"precio_b2b":26298,"stock":173,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000048","descripcion":"AUSTER MAXTECH PRO 10W40 SP- 1 LT","costo":2935,"precio_b2b":3933,"stock":302,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000049","descripcion":"AUSTER MAXTECH PRO RX 5W30 SP/CJ 4LT","costo":11454,"precio_b2b":15348,"stock":2257,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000050","descripcion":"AUSTER MAXTECH PRO FE 5W30 ACEA C3 DPF 200L","costo":503477,"precio_b2b":674659,"stock":19,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000052","descripcion":"AUSTER MAXFORCE 15W40 CK-4 200L","costo":540831,"precio_b2b":724714,"stock":20,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000053","descripcion":"AUSTER MAXFORCE 15W40 CK-4 20L","costo":55422,"precio_b2b":74265,"stock":50,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000054","descripcion":"AUSTER MAXFORCE 10W40 CK-4 200L","costo":620509,"precio_b2b":831481,"stock":1,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000055","descripcion":"AUSTER HYDRO ISO 46 20LT","costo":37638,"precio_b2b":50435,"stock":81,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000056","descripcion":"AUSTER HYDRO ISO 46 200LT","costo":366691,"precio_b2b":491365,"stock":10,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000058","descripcion":"AUSTER HYDRO ISO 68 200LT","costo":369128,"precio_b2b":494631,"stock":9,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000059","descripcion":"AUSTER MAXTECH PRO 10W40 SP 4LT","costo":10882,"precio_b2b":14583,"stock":1078,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000045","descripcion":"AUSTER MAXTECH PRO FE 5W30 SP/CF C3 DPF 6L","costo":17592,"precio_b2b":23573,"stock":1094,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000057","descripcion":"AUSTER HYDRO ISO 68 20LT","costo":38011,"precio_b2b":50935,"stock":7,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000062","descripcion":"AUSTER LITHIUM EP GREASE (RED) 180KG","costo":594384,"precio_b2b":796475,"stock":2,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000063","descripcion":"AUSTER LITHIUM COMPLEX GREASE 180KG","costo":1229953,"precio_b2b":1648137,"stock":2,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000064","descripcion":"AUSTER ATF III 1L","costo":2959,"precio_b2b":3965,"stock":864,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000065","descripcion":"AUSTER 80W-90 LSD 1LT","costo":3255,"precio_b2b":4362,"stock":347,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000067","descripcion":"AUSTER LITHIUM COMPLEX GREASE (BALDE) 15KG","costo":110450,"precio_b2b":148003,"stock":4,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000068","descripcion":"AUSTER 75W80 GL-4 1LT","costo":3047,"precio_b2b":4083,"stock":165,"margen_pct":34},{"linea":"LUBRICANTES","marca":"AUSTER","codigo":"7000069","descripcion":"AUSTER 75W80 GL-5 1LT","costo":3199,"precio_b2b":4286,"stock":228,"margen_pct":34}];

// ─── helpers ──────────────────────────────────────────────────────────────────
const clp = (n) =>
  "$" + Math.round(n).toLocaleString("es-CL");

const LINEA_CONFIG = {
  NEUMATICOS: { label: "Neumáticos", color: "#2a78d6", bg: "#e6f1fb", text: "#185fa5" },
  BATERIAS:   { label: "Baterías",   color: "#1baf7a", bg: "#e1f5ee", text: "#0f6e56" },
  LUBRICANTES:{ label: "Lubricantes",color: "#eda100", bg: "#faeeda", text: "#854f0b" },
};

const MARCAS = ["Todas", ...Array.from(new Set(SKU_DATA.map((s) => s.marca)))];
const LINEAS = ["Todas", "NEUMATICOS", "BATERIAS", "LUBRICANTES"];

// ─── sub-componente: fila SKU ─────────────────────────────────────────────────
function SkuRow({ sku, margenOverride }) {
  const margen = margenOverride ?? sku.margen_pct;
  const precioCustom = Math.round(sku.costo * (1 + margen / 100));
  const margenCLP = precioCustom - sku.costo;
  const cfg = LINEA_CONFIG[sku.linea];

  return (
    <tr style={{ borderBottom: "0.5px solid #f0efe8" }}>
      <td style={{ padding: "9px 10px", fontFamily: "monospace", fontSize: 12, color: "#888" }}>
        {sku.codigo}
      </td>
      <td style={{ padding: "9px 10px", fontSize: 13, color: "#0b0b0b", maxWidth: 280 }}>
        {sku.descripcion}
      </td>
      <td style={{ padding: "9px 10px", textAlign: "right", fontSize: 13, color: "#52514e" }}>
        {clp(sku.costo)}
      </td>
      <td style={{ padding: "9px 10px", textAlign: "right", fontSize: 13, fontWeight: 500, color: "#0b0b0b" }}>
        {clp(precioCustom)}
      </td>
      <td style={{ padding: "9px 10px", textAlign: "right" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 20,
            background: margen >= 30 ? "#eaf3de" : margen >= 25 ? "#faeeda" : "#e6f1fb",
            color: margen >= 30 ? "#3b6d11" : margen >= 25 ? "#854f0b" : "#185fa5",
          }}
        >
          {margen}%
        </span>
      </td>
      <td style={{ padding: "9px 10px", textAlign: "right", fontSize: 12, color: "#1baf7a", fontWeight: 500 }}>
        {clp(margenCLP)}
      </td>
      <td style={{ padding: "9px 10px", textAlign: "right", fontSize: 13 }}>
        <span
          style={{
            display: "inline-block",
            minWidth: 32,
            textAlign: "center",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: 12,
            background: sku.stock > 50 ? "#eaf3de" : sku.stock > 10 ? "#faeeda" : "#fcebeb",
            color: sku.stock > 50 ? "#3b6d11" : sku.stock > 10 ? "#854f0b" : "#a32d2d",
            fontWeight: 500,
          }}
        >
          {sku.stock}
        </span>
      </td>
    </tr>
  );
}

// ─── sub-componente: acordeón por marca ──────────────────────────────────────
function MarcaAccordion({ marca, skus, margenOverride }) {
  const [open, setOpen] = useState(false);
  const cfg = LINEA_CONFIG[skus[0]?.linea];
  const totalStock = skus.reduce((a, s) => a + s.stock, 0);
  const avgMargen = margenOverride ?? Math.round(skus.reduce((a, s) => a + s.margen_pct, 0) / skus.length);

  return (
    <div style={{ borderRadius: 8, border: "0.5px solid #e1e0d9", marginBottom: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: open ? "#f8f7f3" : "#fff",
          border: "none",
          cursor: "pointer",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              padding: "3px 10px",
              borderRadius: 20,
              background: cfg?.bg || "#f1efe8",
              color: cfg?.text || "#444",
            }}
          >
            {marca}
          </span>
          <span style={{ fontSize: 13, color: "#52514e" }}>
            {skus.length} SKUs · {totalStock.toLocaleString("es-CL")} unidades · margen {avgMargen}%
          </span>
        </div>
        <span style={{ fontSize: 18, color: "#888", lineHeight: 1, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          ›
        </span>
      </button>

      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ background: "#fafaf8" }}>
                {["Código", "Descripción", "Costo neto", "Precio B2B", "Margen", "Margen $", "Stock"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "7px 10px",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#888",
                      textAlign: h === "Código" || h === "Descripción" ? "left" : "right",
                      borderBottom: "0.5px solid #e1e0d9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skus.map((s) => (
                <SkuRow key={s.codigo} sku={s} margenOverride={margenOverride} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── sub-componente: acordeón por línea ──────────────────────────────────────
function LineaAccordion({ linea, skus, margenOverride, marcaFiltro }) {
  const [open, setOpen] = useState(true);
  const cfg = LINEA_CONFIG[linea];

  const marcasEnLinea = Array.from(new Set(skus.map((s) => s.marca)));
  const skusFiltrados = marcaFiltro && marcaFiltro !== "Todas"
    ? skus.filter((s) => s.marca === marcaFiltro)
    : skus;

  const skusPorMarca = marcasEnLinea
    .filter((m) => marcaFiltro === "Todas" || !marcaFiltro || m === marcaFiltro)
    .map((m) => ({ marca: m, skus: skusFiltrados.filter((s) => s.marca === m) }))
    .filter((g) => g.skus.length > 0);

  if (skusFiltrados.length === 0) return null;

  const totalUnidades = skusFiltrados.reduce((a, s) => a + s.stock, 0);
  const valorStock = skusFiltrados.reduce((a, s) => a + s.costo * s.stock, 0);

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 18px",
          marginBottom: 10,
          background: cfg.color + "12",
          border: `1px solid ${cfg.color}30`,
          borderLeft: `4px solid ${cfg.color}`,
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: cfg.text }}>{cfg.label}</span>
        <span style={{ fontSize: 13, color: "#52514e", flex: 1, textAlign: "left" }}>
          {skusFiltrados.length} SKUs · {totalUnidades.toLocaleString("es-CL")} unid · valor {clp(valorStock)}
        </span>
        <span style={{ fontSize: 18, color: cfg.text, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          ›
        </span>
      </button>

      {open && (
        <div style={{ paddingLeft: 4 }}>
          {skusPorMarca.map(({ marca, skus: mSkus }) => (
            <MarcaAccordion key={marca} marca={marca} skus={mSkus} margenOverride={margenOverride} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function PricingTab() {
  const [busqueda, setBusqueda] = useState("");
  const [lineaFiltro, setLineaFiltro] = useState("Todas");
  const [marcaFiltro, setMarcaFiltro] = useState("Todas");
  const [ordenar, setOrdenar] = useState("linea");
  const [margenCustom, setMargenCustom] = useState(null); // null = usar margen por línea
  const [modoLista, setModoLista] = useState(false);

  const marcasDisponibles = useMemo(() => {
    if (lineaFiltro === "Todas") return MARCAS;
    const m = Array.from(new Set(SKU_DATA.filter((s) => s.linea === lineaFiltro).map((s) => s.marca)));
    return ["Todas", ...m];
  }, [lineaFiltro]);

  const skusFiltrados = useMemo(() => {
    let data = [...SKU_DATA];
    if (lineaFiltro !== "Todas") data = data.filter((s) => s.linea === lineaFiltro);
    if (marcaFiltro !== "Todas") data = data.filter((s) => s.marca === marcaFiltro);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      data = data.filter(
        (s) =>
          s.descripcion.toLowerCase().includes(q) ||
          s.codigo.toLowerCase().includes(q) ||
          s.marca.toLowerCase().includes(q)
      );
    }
    if (ordenar === "precio_asc") data.sort((a, b) => a.precio_b2b - b.precio_b2b);
    else if (ordenar === "precio_desc") data.sort((a, b) => b.precio_b2b - a.precio_b2b);
    else if (ordenar === "stock_desc") data.sort((a, b) => b.stock - a.stock);
    else if (ordenar === "margen_desc") data.sort((a, b) => b.margen_pct - a.margen_pct);
    return data;
  }, [lineaFiltro, marcaFiltro, busqueda, ordenar]);

  const lineasEnData = Array.from(new Set(skusFiltrados.map((s) => s.linea)));
  const totalUnidades = skusFiltrados.reduce((a, s) => a + s.stock, 0);
  const valorTotal = skusFiltrados.reduce((a, s) => a + s.costo * s.stock, 0);

  const inp = { padding: "7px 11px", fontSize: 13, borderRadius: 6, border: "0.5px solid #d3d1c7", outline: "none", background: "#fff", color: "#0b0b0b", fontFamily: "inherit" };
  const btn = (active) => ({
    padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "0.5px solid " + (active ? "#2a78d6" : "#d3d1c7"),
    background: active ? "#e6f1fb" : "#fff", color: active ? "#185fa5" : "#52514e",
    cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 500 : 400,
  });

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "24px 0", maxWidth: 980 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#0b0b0b", margin: 0 }}>Pricing</h2>
          <p style={{ fontSize: 13, color: "#888", margin: "3px 0 0" }}>
            {skusFiltrados.length} SKUs · {totalUnidades.toLocaleString("es-CL")} unidades · valor stock {clp(valorTotal)} CLP neto
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn(!modoLista)} onClick={() => setModoLista(false)}>Acordeón</button>
          <button style={btn(modoLista)} onClick={() => setModoLista(true)}>Lista plana</button>
        </div>
      </div>

      {/* filtros */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          placeholder="Buscar por código, descripción o marca…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ ...inp, width: 280 }}
        />
        <select value={lineaFiltro} onChange={(e) => { setLineaFiltro(e.target.value); setMarcaFiltro("Todas"); }} style={inp}>
          {LINEAS.map((l) => <option key={l} value={l}>{l === "Todas" ? "Todas las líneas" : LINEA_CONFIG[l]?.label}</option>)}
        </select>
        <select value={marcaFiltro} onChange={(e) => setMarcaFiltro(e.target.value)} style={inp}>
          {marcasDisponibles.map((m) => <option key={m} value={m}>{m === "Todas" ? "Todas las marcas" : m}</option>)}
        </select>
        <select value={ordenar} onChange={(e) => setOrdenar(e.target.value)} style={inp}>
          <option value="linea">Ordenar por línea</option>
          <option value="precio_asc">Precio ↑</option>
          <option value="precio_desc">Precio ↓</option>
          <option value="stock_desc">Mayor stock</option>
          <option value="margen_desc">Mayor margen</option>
        </select>

        {/* ajuste de margen global */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: "#888" }}>Margen global</span>
          <input
            type="number"
            min={5}
            max={80}
            placeholder="auto"
            value={margenCustom ?? ""}
            onChange={(e) => setMargenCustom(e.target.value ? parseInt(e.target.value) : null)}
            style={{ ...inp, width: 72, textAlign: "center" }}
          />
          <span style={{ fontSize: 12, color: "#888" }}>%</span>
          {margenCustom !== null && (
            <button onClick={() => setMargenCustom(null)} style={{ ...inp, padding: "6px 10px", cursor: "pointer", fontSize: 11, color: "#a32d2d", borderColor: "#f7c1c1" }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* chips de línea rápida */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {LINEAS.map((l) => {
          const cfg = l !== "Todas" ? LINEA_CONFIG[l] : null;
          const active = lineaFiltro === l;
          return (
            <button
              key={l}
              onClick={() => { setLineaFiltro(l); setMarcaFiltro("Todas"); }}
              style={{
                padding: "4px 14px", fontSize: 12, borderRadius: 20,
                border: `1px solid ${active && cfg ? cfg.color : "#d3d1c7"}`,
                background: active && cfg ? cfg.bg : active ? "#0b0b0b10" : "#fff",
                color: active && cfg ? cfg.text : active ? "#0b0b0b" : "#52514e",
                cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 500 : 400,
              }}
            >
              {l === "Todas" ? "Todas" : cfg.label}
            </button>
          );
        })}
      </div>

      {/* contenido */}
      {skusFiltrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#888", fontSize: 14 }}>
          Sin resultados para esa búsqueda
        </div>
      ) : modoLista ? (
        /* modo lista plana */
        <div style={{ overflowX: "auto", borderRadius: 8, border: "0.5px solid #e1e0d9" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ background: "#fafaf8" }}>
                {["Línea", "Código", "Descripción", "Marca", "Costo", "Precio B2B", "Margen", "Margen $", "Stock"].map((h) => (
                  <th key={h} style={{ padding: "9px 10px", fontSize: 11, fontWeight: 500, color: "#888", textAlign: ["Línea","Código","Descripción","Marca"].includes(h) ? "left" : "right", borderBottom: "0.5px solid #e1e0d9", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skusFiltrados.map((s) => {
                const margen = margenCustom ?? s.margen_pct;
                const precioCustom = Math.round(s.costo * (1 + margen / 100));
                const cfg = LINEA_CONFIG[s.linea];
                return (
                  <tr key={s.codigo} style={{ borderBottom: "0.5px solid #f0efe8" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: cfg.bg, color: cfg.text }}>{cfg.label}</span>
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 12, color: "#888" }}>{s.codigo}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#0b0b0b" }}>{s.descripcion}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#52514e" }}>{s.marca}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, color: "#52514e" }}>{clp(s.costo)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontWeight: 500 }}>{clp(precioCustom)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 6px", borderRadius: 10, background: margen >= 30 ? "#eaf3de" : margen >= 25 ? "#faeeda" : "#e6f1fb", color: margen >= 30 ? "#3b6d11" : margen >= 25 ? "#854f0b" : "#185fa5" }}>{margen}%</span>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: "#1baf7a", fontWeight: 500 }}>{clp(precioCustom - s.costo)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 6px", borderRadius: 4, background: s.stock > 50 ? "#eaf3de" : s.stock > 10 ? "#faeeda" : "#fcebeb", color: s.stock > 50 ? "#3b6d11" : s.stock > 10 ? "#854f0b" : "#a32d2d" }}>{s.stock}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* modo acordeón */
        <div>
          {lineasEnData.map((linea) => (
            <LineaAccordion
              key={linea}
              linea={linea}
              skus={skusFiltrados.filter((s) => s.linea === linea)}
              margenOverride={margenCustom}
              marcaFiltro={marcaFiltro}
            />
          ))}
        </div>
      )}
    </div>
  );
}
