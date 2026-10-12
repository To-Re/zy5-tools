# 上海两入口来源链接核验

核验日：2026-10-12。本报告初次核验覆盖 `lib/labor-rules.ts` 的上海冻结工资与规划器来源并集：29个标识、27个官方URL；末节另追加退休当月缴费FAQ，合计30个标识、28个URL。新增历史指数资料帮助FAQ由扩域工作流另行核读，详见规则注册表。包括两入口继承的国家规则，不扩展为全站链接检查。

## 核验方法及结论

逐链接读取官方正文，不以首页、标题、HTTP 200 或搜索摘要替代条款。23 个不同 HTML 链接由网页工具打开并读取正文；2 个公积金链接用可见 Chrome 读取通知/问答正文；税表 PDF 可提取正文；养老 DOC 经官方父页面链接定位，远端返回 Word 类型，已下载原件经 `textutil` 提取正文。29 个标识均有可读内容证据。

终端对27个 URL 的有界请求统一受 DNS 解析限制（`nodename nor servname provided, or not known`），未取得源站 HTTP 状态码。网页工具和浏览器正文成功读取不提供本轮可引用的数值 HTTP 状态；因此下表的“正文可读”不等于声称“HTTP 200”。公积金网页解析失败由官方 Chrome 正文补证；Word 工具报不支持 `application/msword` 是解析限制，不是源站返回 HTTP 400。未改用非官方转载。

引用路径缩写均相对 `lib/labor-rules.ts`：A=`LABOR_AUTO_CONTRIBUTION_RULES` 中 `sh-ordinary-personal-auto-202610`；F=`LABOR_FROZEN_SALARY_RULES[0]`；P=`LABOR_PENSION_PLANNER_RULES.projection`；R=`LABOR_PENSION_PLANNER_RULES.retirement`；B=`LABOR_PENSION_PLANNER_RULES.province`。具体字段和来源列表以代码为准。下列每行核验日期均为 **2026-10-12**，HTTP数值状态均为**未取得**。

## 逐来源记录

| sourceId / 官方标题与链接 | 内容读取状态 | 引用路径 | 已核正文、日期与采用边界 |
| --- | --- | --- | --- |
| `sh-pension-2026`<br>[沪人社规〔2026〕16号：本市企业基本养老金计发办法](https://www.shanghai.gov.cn/gwk/search/content/t0035_1443100) | 网页正文可读 | `P.formulaEvidence / accountEvidence` | 第1、2条：申领次月；两项构成；缴费年限保留4位，各分项见分进角。2026-08-16至2031-08-15，旧2021年32/27号废止。 |
| `sh-pension-index-attachment`<br>[沪人社规〔2026〕16号附件：基础养老金计算公式及逐月指数](https://rsj.sh.gov.cn/cmsres/ee/ee24450581ee4bb1af9586591f2ce38d/2481722c28c39ab037ad43047811e37d.doc) | Word 类型可达；原件/提取文本可读 | `P.indexEvidence / formulaEvidence` | 官方父页面附件；远端识别 application/msword，网页解析器不支持。已下载原件及 textutil 文本可读；第2/3项逐月求和及月指数4位，第4项1993—2013历史保底，第5项一次性缴费。见附件证据。 |
| `sh-pension-claim-start`<br>[沪人社规〔2026〕16号第一条：申领条件与次月发放](https://www.shanghai.gov.cn/gwk/search/content/t0035_1443100) | 网页正文可读 | `P.payoutEvidence` | 与 sh-pension-2026 共用正文，第1条从按规定办妥申领手续的次月发放；到龄本身不等于首月待遇。 |
| `sh-contribution-base-2026`<br>[上海2026年度社保缴费基数上下限](https://rsj.sh.gov.cn/tgsgg_17341/20260818/t0035_1443203.html) | 网页正文可读 | `A 社保基数；P.contributionEvidence / indexEvidence / formulaEvidence` | 2026-08-18发布，7月1日起7546—37731元；上年全口径月均12577元。 |
| `sh-pension-pooling-explanation`<br>[全国养老统筹费率及上海各险种统一基数：2025人大答复](https://rsj.sh.gov.cn/trdgzbldfqk_17404/20251011/t0035_1436039.html) | 网页正文可读 | `A 养老及险种基数；F.deductions / ordinaryEmployerSocialExemption；P.contributionEvidence` | 正文2025-03-31；全国统筹2022年起单位16%、个人8%；各险基数统一养老。个人失业0.5%；单位阶段降费仅说到2025年底，不作为2026单位费率。 |
| `sh-flexible-pension`<br>[沪人社规〔2024〕3号：灵活就业养老缴费比例20%](https://www.shanghai.gov.cn/nw12344/20240228/1fa3b59ef795429f9bc3cfd7b6599ceb.html) | 网页正文可读 | `P.contributionEvidence` | 沪人社规2024年3号，1月16日成文、2月28日门户发布；2024-03-01至2028-04-30，养老比例20%。 |
| `sh-flexible-population`<br>[沪人社规〔2023〕5号：灵活就业参保条件与缴费](https://www.shanghai.gov.cn/grshbxsjzc/20241112/dc9f6287c6d04c4badc4fe906981f986.html) | 网页正文可读 | `P.contributionEvidence` | 沪人社规2023年5号，2023-03-31成文；2023-05-01至2028-04-30。只采身份、自选60%—300%基数及按月缴费；旧24%、年龄及年限不沿用。 |
| `pension-personal-account-credit`<br>[国发〔2005〕38号第三、六条：个人账户8%入账](https://fgk.chinatax.gov.cn/zcfgk/c102440/c5193739/content.html) | 网页正文可读 | `P.accountEvidence` | 国发2005年38号，法规库全文有效；第3/6条灵活20%中8%入账，2006年起账户8%、单位不划入。 |
| `pension-divisor`<br>[国发〔2005〕38号及个人账户养老金计发月数表](https://fgk.chinatax.gov.cn/zcfgk/c102440/c5193739/content.html) | 官方正文＋本地原图目视可读 | `P.accountDivisors / formulaEvidence` | 与账户入账共用官方正文；官方表图已有本地原图并本轮目视核对50—66整周岁。非整周岁不自行插值。 |
| `pension-window`<br>[计发月数不是养老金领取截止期限](https://rsj.sh.gov.cn/trdhy_17355/20211015/t0035_1403121.html) | 网页正文可读 | `P.payoutEvidence` | 正文2021-09-13答复，说明139不是领取截止月数；不用于金额参数。 |
| `retirement-reform`<br>[2024年延迟法定退休年龄决定与出生年月对照表](https://www.mot.gov.cn/hudong/xiangguanziliao/202601/t20260114_4197321.html) | 网页正文可读 | `R 出生月年龄、最低年限` | 2024-09-13决定，2025-01-01施行；交通运输部官方转载2026-01-14。正文月度延迟及2030年起最低年限阶梯可读。 |
| `retirement-flexible`<br>[人社部发〔2024〕94号：实施弹性退休制度暂行办法](https://hrss.sz.gov.cn/xxgk/qtxx/tzgg/content/post_11934292.html) | 网页正文可读 | `R 弹性退休；P.sourceIds` | 2024-12-31成文、深圳人社2025-01-01转载。第7条最低年限对应年份，第8/9条申领和次月领取；2025-01-01施行。 |
| `pension-transfer`<br>[国办发〔2009〕66号：跨省转移接续与待遇领取地](https://www.beijing.gov.cn/zhengce/gwywj/201001/t20100101_781119.html) | 网页正文可读 | `B 待遇领取省分支` | 国办发2009年66号，2009-12-28成文；门户发布2009-12-29；2010-01-01施行。第6条四分支、第7条待遇领取地计发，页面标有效。 |
| `pension-transfer-2016`<br>[人社部规〔2016〕5号：跨省养老关系转移接续若干问题](https://hrss.sz.gov.cn/gkmlpt/content/5/5528/post_5528907.html) | 网页正文可读 | `B 省级年限/临时账户/户籍兜底` | 人社部规2016年5号，2016-11-28成文；深圳2018-05-25转载。第1/3/8条正文可读。 |
| `pension-transfer-current`<br>[2026年多地工作后领取养老金地点：省级四分支说明](https://www.suzhou.gov.cn/szsrmzf/rdwd/202609/d935e3eda17c48b1b7ce031fef41bfc5.shtml) | 网页正文可读 | `B 当前解释佐证` | 2026-09-20苏州社保解释四分支，明确以省为单位；不把江苏省内口径延展到上海。 |
| `sh-unemployment-personal-base-2013`<br>[沪府发〔2013〕62号第三条：失业个人基础缴费比例](https://rsj.sh.gov.cn/txgszfgz_17262/20200617/t0035_1388468.html) | 网页正文可读 | `A 个人失业；F.deductions.unemployment` | 沪府发2013年62号，8月28日成文、9月6日发布、10月1日起；第3条个人1%改0.5%未设期限。仅采此条，不采整篇旧费率。 |
| `sh-unemployment-personal-continuity-2016`<br>[沪府发〔2016〕18号第三条：失业个人比例不变](https://rsj.sh.gov.cn/txgszfgz_17262/20200617/t0035_1388516.html) | 网页正文可读 | `A 个人失业；F.deductions.unemployment` | 沪府发2016年18号，3月21日发布，1月1日起；第3条单位1.5%改1%，个人不变。历史连续性证据。 |
| `sh-unemployment-temporary-employer-2017`<br>[沪府〔2017〕48号第二条：阶段降费仅改变单位比例](https://rsj.sh.gov.cn/txgszfgz_17262/20200617/t0035_1388551.html) | 网页正文可读 | `A 个人失业；F.deductions.unemployment` | 沪府2017年48号，4月28日；单位1%降0.5%只在2017-01至2018-04，个人不调整。到期历史条款不支持2026单位降费。 |
| `sh-housing-2026`<br>[沪公积金管委会〔2026〕3号：2026年度基数比例与月额](https://www.shzfgjj.cn/html/newxxgk/zcwj/gfxwj/228478.html) | Chrome 官方正文可读 | `A 住房比例/基数；F.housingTax` | Chrome正文：沪公积金管委会2026年3号，产生日期2026-08-18，信息有效性“有效”，SY4250087880-2026-228478。7月1日起；2025月均，基数2740—37731，双方5%—7%取整数。正文没有明确通用舍入，产品只接受自然整元。 |
| `sh-housing-base-tax-cap-2026`<br>[2026年度上海公积金基数调整问答：当地均薪与三倍上限](https://www.shzfgjj.cn/html/newxxgk/zcjd/228480.html) | Chrome 官方正文可读 | `A 住房同率；F.housingTax` | Chrome正文第1问：当地上年月均12577、三倍37731，与社保口径一致；第11问：单位一个比例、双方同率。未见独立发布日期；正文8月18日指均薪公布日。 |
| `sh-long-term-care-2026`<br>[沪府办规〔2025〕19号：长期护理保险试点办法](https://www.shanghai.gov.cn/nw12344/20251231/51cafb297f0a4397ad30afe0d91ad104.html) | 网页正文可读 | `A 医疗项目边界 / sourceIds` | 沪府办规2025年19号，12月27日落款、29日印发、31日门户发布；2026-01-01至2027-12-31。第3/6/25条：单位医保基数0.5%从统筹基金调剂，不另加现金缴费。 |
| `sh-medical-2026`<br>[沪医保规〔2026〕2号：继续阶段性降低职工基本医疗保险费费率](https://ybj.sh.gov.cn/gfxwj/20260313/921e047144694b61b6df8ca0c5ef2cfc.html) | 网页正文可读 | `A 医疗；F.deductions.medical / ordinaryEmployerSocialExemption` | 沪医保规2026年2号，2026-03-10；2026-03-01至2027-02-28，单位9%=8.5%含生育+0.5%地方附加，个人2%。 |
| `sh-employee-declaration-2026`<br>[上海市税务局通告2026年第1号：2026社保年度职工缴费工资申报](https://shanghai.chinatax.gov.cn/zcfw/zcfgk/sbf/202604/t480144.html) | 网页正文可读 | `A 上年均薪映射` | 税务通告2026年1号，4月24日成文、28日发布，全文有效；2026-07至2027-06年度按2025月均，第3项另列不足年和新招录。 |
| `social-insurance-law`<br>[中华人民共和国社会保险法（2018年修正）](https://wjw.hubei.gov.cn/bmdt/ztzl/hbzyjk/fgbz__/202207/t20220701_4200696.shtml) | 网页正文可读 | `F.ordinaryEmployerSocialExemption / employerStatutoryExemptionWithoutAmount` | 2018-12-29修正，湖北卫健委2022-07-01转载。第12/23/33/44/53/60条主体及代扣；不据此填地方费率。 |
| `iit-contribution-deduction`<br>[财税〔2006〕10号：三险一金个人所得税扣除范围与限额](https://fgk.chinatax.gov.cn/zcfgk/c102416/c5203070/content.html) | 网页正文可读 | `F.deductions / housingTax / ordinaryEmployerSocialExemption / employerStatutoryExemptionWithoutAmount` | 财税2006年10号，2006-06-27。第1条法定三险单位免税、个人可扣；第2条住房分别12%、基数不超工作地上年当地月均三倍。 |
| `iit-law`<br>[中华人民共和国个人所得税法（现行全文有效）](https://fgk.chinatax.gov.cn/zcfgk/c100009/c5193028/content.html) | 网页正文可读 | `F.tax 年度税基与税表` | 2018-08-31，2019-01-01施行；法规库全文有效。第6/11条年度60000及综合所得规则可读。 |
| `iit-table`<br>[综合所得税率及速算扣除数（官方附件）](https://shanghai.chinatax.gov.cn/zcfw/zcfgk/grsds/202402/P020240202362406243753.pdf) | PDF 正文可读 | `F.tax.brackets` | 官方 application/pdf，1页12行提取正文；7档税率3/10/20/25/30/35/45和速算扣除数0/2520/16920/31920/52920/85920/181920完整可读。 |
| `sh-medical-public-fund-definition`<br>[上海市职工基本医疗保险办法：地方附加基金性质](https://www.shanghai.gov.cn/xxzfgzwj/20210608/cf17834e28934dc3866d02047416e8c7.html) | 网页正文可读 | `F.ordinaryEmployerSocialExemption` | 2013-10-14公布、12月1日起；只采第2/17/40条基本医保、地方附加全部入公共基金及财政专户性质。旧单位费率和账户待遇不采。 |
| `iit-withholding`<br>[国家税务总局公告2018年第61号：累计预扣公式](https://fgk.chinatax.gov.cn/zcfgk/c100012/c5194838/content.html) | 网页正文可读 | `F.tax.sourceIds 继承来源` | 2018年61号，2018-12-21、2019-01-01施行，法规库全文有效。第6条累计预扣公式可读；本入口固定12期年度比较不据此宣称真实本月预扣。 |

## 附件原件与可复核证据

以下文件是本地核验工件，不作为永久仓库附件；哈希保留了此次所读版本。养老附件的官方来源链接见上表，父页为沪人社规〔2026〕16号。

| 文件/引用 | 大小 | SHA-256 | 本轮读取 |
| --- | --- | --- | --- |
| `shanghai-pension-2026.doc` | 27648 bytes | `497ca9309d3e890b0d9dea89655c5bb2a4bd57935a7b57896e22ad617b88567e` | 官方 Word 原件；`textutil` 提取成功 |
| `shanghai-pension-2026.txt` | 1351 bytes | `09c9acf397fd3f32b518c99d19f3ba56c34f9c2008ecdb640c4c3789e780e753` | 5项完整正文，逐月指数、历史保底及特殊缴费明确 |
| `pension-national-divisors.png` | 163638 bytes | `ac86bcff22dac290364977f2813fd671f67a3894b50c12837e69f43301275b05` | 实际目视表格；50—66整周岁依次195/190/185/180/175/170/164/158/152/145/139/132/125/117/109/101/93 |

计发月数图官方引用：[国发2005年38号附件图片](https://fgk.chinatax.gov.cn/zcfgk/c102440/c5193739/5193739/images/lB0Tq57k.png)。该图依附官方正文，本轮采用已下载图像和正文，不伪称重新取得图片 HTTP 状态码。

本轮目录工件：`zy5-two-entry-sources.json` 为生产 registry 来源快照；`zy5-source-check-results.json` 记录终端 DNS 失败，不能解释为链接失效。公积金 Chrome 实际正文核对包含通知标题、文号、有效性、基数/比例及问答第1/11问，不只核页面存在。

## 证据适用限制

- 历史页面可读不表示整篇参数当前有效。个人失业0.5%采用2013基础调整、2016/2017个人不变及2025当前说明的连续证据；2025单位降费期限不延长到2026，单位失业金额仍未知，不输出上海完整单位成本。
- 前轮工资8000—15000元整百为实现限制，本轮已移除；当前工资按分、上年均薪暂按整元并逐项检查尾差。住房无通用舍入条款，不从表格反推舍入。税表及扣除来源不把固定规则年度比较变为实际全年或本月预扣结论。
- 未来养老冻结2026参数、零增长零利息；首月领取须假设退休月办妥申领。前轮1/2/3倍基数、2014切点及三月倍数均为实现约束，本轮已扩至整元范围、1993起已核保底历史和任意总月数取舍双界；不能作为未来法规不变的承诺。
- 成文日期、网页发布日期、实施日期分别处理；URL路径日期不代替正文日期。公积金问答未见独立发布日期，保持未知。
- 本报告验证来源可读性及引用边界，不代替引擎测试、独立法律审核或浏览器产品验收。

养老历史指数与时间轴研究已从临时报告复制为 [上海养老时间轴证据](labor-shanghai-pension-timeline-evidence.md)。本轮仅新增这两份文档，未修改计算代码、提交或部署。

## 2026-10-12 追加：退休当月缴费

`sh-retirement-month-payment`：上海市人社局《退休当月还需要缴纳社保费吗？》，发布时间2026-09-11。通过官网养老保险问答索引点击进入并读取完整正文：
https://rsj.sh.gov.cn/tyljlqtj_17556/20260911/t0035_1443669.html

正文分别规定企业职工到龄月仍属在职、单位正常缴纳；灵活就业在已满足法定缴费年限时可自愿选择缴纳当月养老费。后者不能借单位规则无条件套用。记录于`LABOR_SOURCES`及规划规则的退休月缴费专门证据字段；未来仍只是冻结本口径的情景。此处未声称数值HTTP状态。
