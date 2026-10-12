import type { ContributionPeriodRule, PayrollRule, PensionRule, TaxRule, RetirementRule, VerifiedPayrollRule } from './labor-engine';
import type { PensionContributionItemRule } from './labor-contribution-item';
import type { BenefitProvinceRule } from './labor-benefit-province';
import type { PensionComponentRule } from './labor-pension-components';
import type { HousingFundRule } from './labor-housing-fund';
import type { FlexibleContributionRule } from './labor-flexible-contributions';
import type { AutoContributionRule, AutoContributionItemRule } from './labor-auto-scenario';
import type { FrozenZeroTaxProofRule, FrozenSalaryComparisonRule } from './labor-frozen-salary';
import type { PensionPlannerRules } from './labor-pension-planner';

/** Versioned public evidence only. No user inputs or private operational data belong here. */
export const LABOR_RULE_VERSION = '2026-10-12.3';
export interface LaborSource {
  id: string; title: string; url: string; authority: string;
  publishedAt: string | null; effectiveFrom: string | null; effectiveTo: string | null;
  verifiedAt: string; scope: string; note: string;
}
export const LABOR_SOURCES: Record<string, LaborSource> = {
  'sh-pension-index-faq-2026': {
    id: 'sh-pension-index-faq-2026', title: '上海人社：基本养老金计发办法中本人缴费工资指数如何确定',
    url: 'https://rsj.sh.gov.cn/tyljjfbf_17557/20260911/t0035_1443674.html',
    authority: '上海市人力资源和社会保障局', publishedAt: '2026-09-11', effectiveFrom: null, effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '上海企业基本养老金逐月缴费指数定义及核定资料填写提示',
    note: '官方问答说明月缴费基数与对应上一年度全口径月均工资之比保留4位；不据此假称普通账户查询直接提供指数和，也不从显示平均指数倒推。填写者应向经办核对逐月指数和与历史保底处理。问答发布日期不冒充法规生效日期。',
  },
  'sh-pension-index-attachment': {
    id: 'sh-pension-index-attachment', title: '沪人社规〔2026〕16号附件：基础养老金计算公式及逐月指数',
    url: 'https://rsj.sh.gov.cn/cmsres/ee/ee24450581ee4bb1af9586591f2ce38d/2481722c28c39ab037ad43047811e37d.doc',
    authority: '上海市人力资源和社会保障局', publishedAt: '2026-07-24', effectiveFrom: '2026-08-16', effectiveTo: '2031-08-15', verifiedAt: '2026-10-12',
    scope: '上海企业基本养老金月指数求和、平均和历史保底；未来仅作冻结公式数学模型',
    note: '附件第2/3项平均指数为逐月指数和除以缴费月数，月指数为基数除以对应上年上海全口径月均、保留4位；第4项1993—2013历史保底、第5项一次性缴费特殊合并。历史显示平均可能已修约，不自动乘月份重建精确指数和；未来支持法定上下限内整元基数；月指数及折年四位取舍未核时以相邻四位上下界计算，最终进角相同时才给单一精确金额。1/2/3倍仅保留为示例值。',
  },
  'sh-pension-claim-start': {
    id: 'sh-pension-claim-start', title: '沪人社规〔2026〕16号第一条：申领条件与次月发放',
    url: 'https://www.shanghai.gov.cn/gwk/search/content/t0035_1443100',
    authority: '上海市人力资源和社会保障局', publishedAt: '2026-07-24', effectiveFrom: '2026-08-16', effectiveTo: '2031-08-15', verifiedAt: '2026-10-12',
    scope: '上海基本养老金申领与首月待遇；未来仅条件式时间轴',
    note: '达到国家规定申领年龄和最低缴费年限且待遇地确认上海，从按规定办妥申领手续次月发放；不能无条件把到龄次月当实际首月。未来模型需明示假设退休月办妥申领，法定效期不因模型延展。',
  },
  'pension-personal-account-credit': {
    id: 'pension-personal-account-credit', title: '国发〔2005〕38号第三、六条：个人账户8%入账',
    url: 'https://fgk.chinatax.gov.cn/zcfgk/c102440/c5193739/content.html',
    authority: '国务院（国家税务总局法规库全文有效）', publishedAt: '2005-12-03', effectiveFrom: '2006-01-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '企业职工及限定灵活就业养老个人账户入账份额；不用于还原历史余额',
    note: '第六条自2006-01-01个人账户规模为本人缴费工资8%，单位不划入；第三条灵活总20%中8%记个人账户。仅采入账关系，旧退休年龄/15年及基数不能替代后法；未来记账利息为模型参数，不把总现金缴费全部入账。',
  },
  "sh-pension-pooling-explanation": {
    "id": "sh-pension-pooling-explanation",
    "title": "全国养老统筹费率及上海各险种统一基数：2025人大答复",
    "url": "https://rsj.sh.gov.cn/trdgzbldfqk_17404/20251011/t0035_1436039.html",
    "authority": "上海市人力资源和社会保障局",
    "publishedAt": "2025-03-31",
    "effectiveFrom": "2022-01-01",
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "上海普通企业职工养老16%/8%及个人上年均薪、单位基数汇总",
    "note": "2025-03-31为正文发布时间/落款，URL路径日期非生效日。说明国办发2021#48全国统筹自2022-01-01统一单位16%、个人8%；本市各险种基数统一养老基数、单位基数为个人之和。本页失业阶段降费只到2025年底，不能据其推定2026单位费率；医保须另用2026原文。"
  },
  "sh-unemployment-personal-base-2013": {
    "id": "sh-unemployment-personal-base-2013",
    "title": "沪府发〔2013〕62号第三条：失业个人基础缴费比例",
    "url": "https://rsj.sh.gov.cn/txgszfgz_17262/20200617/t0035_1388468.html",
    "authority": "上海市人民政府（市人社局官方全文）",
    "publishedAt": "2013-09-06",
    "effectiveFrom": "2013-10-01",
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "只引用普通职工失业个人0.5%条款",
    "note": "2013-08-28落款，第三条个人1%调整0.5%，该基础调整无期限；仅采个人条款，整篇旧养老/医保/生育参数不能认定当期有效。2016、2017和2025官方文本连续说明个人不变。"
  },
  "sh-unemployment-personal-continuity-2016": {
    "id": "sh-unemployment-personal-continuity-2016",
    "title": "沪府发〔2016〕18号第三条：失业个人比例不变",
    "url": "https://rsj.sh.gov.cn/txgszfgz_17262/20200617/t0035_1388516.html",
    "authority": "上海市人民政府（市人社局官方全文）",
    "publishedAt": "2016-03-21",
    "effectiveFrom": "2016-01-01",
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "上海失业个人基础比例连续性",
    "note": "第三条将单位1.5%改1%，明确个人比例不变。仅用于佐证2013个人0.5%基础率；不继承其他旧参数。"
  },
  "sh-unemployment-temporary-employer-2017": {
    "id": "sh-unemployment-temporary-employer-2017",
    "title": "沪府〔2017〕48号第二条：阶段降费仅改变单位比例",
    "url": "https://rsj.sh.gov.cn/txgszfgz_17262/20200617/t0035_1388551.html",
    "authority": "上海市人民政府（市人社局官方全文）",
    "publishedAt": "2017-04-28",
    "effectiveFrom": "2017-01-01",
    "effectiveTo": "2018-04-30",
    "verifiedAt": "2026-10-12",
    "scope": "只证明当时阶段性降费的单位/个人边界",
    "note": "第二条限时将单位1%降0.5%，个人不作调整。该期限不能延展至2026；个人0.5%准入来自2013基础调整、2016不变及2025当前说明，不来自本条续期。"
  },
  "sh-housing-2026": {
    "id": "sh-housing-2026",
    "title": "沪公积金管委会〔2026〕3号：2026年度基数比例与月额",
    "url": "https://www.shzfgjj.cn/html/newxxgk/zcwj/gfxwj/228478.html",
    "authority": "上海市住房公积金管理委员会",
    "publishedAt": "2026-08-18",
    "effectiveFrom": "2026-07-01",
    "effectiveTo": "2027-06-30",
    "verifiedAt": "2026-10-12",
    "scope": "上海普通连续在职正常缴存职工；不含新入职/调入、补充或降缓缴",
    "note": "新官网经上海市政府机构导航确认；Chrome全文已核，页面有效。取2025月均，基数2740–37731；双方5%–7%取整数。年度7月至次年6月。未核通用基数取整/月额舍入；上年月均及基数暂接受整元，并逐项检查公积金乘积是否自然整元，未知尾差不猜舍入。工资无需整百，不采用表格倒推舍入。"
  },
  "sh-housing-base-tax-cap-2026": {
    "id": "sh-housing-base-tax-cap-2026",
    "title": "2026年度上海公积金基数调整问答：当地均薪与三倍上限",
    "url": "https://www.shzfgjj.cn/html/newxxgk/zcjd/228480.html",
    "authority": "上海市公积金管理中心",
    "publishedAt": null,
    "effectiveFrom": "2026-07-01",
    "effectiveTo": "2027-06-30",
    "verifiedAt": "2026-10-12",
    "scope": "上海2026公积金年度上年当地月均工资及同率",
    "note": "第1问当地公布上年月均12577元、3倍37731元且与社保上限计算口径一致；第11问单位一个比例、双方相同。与财税2006#10的12%/3倍税限联合使用，不声称本问答独立制定个税法。 页面未单独展示发布日期；正文8月18日指社平工资公布日，不冒充问答发布日期。"
  },
  "sh-long-term-care-2026": {
    "id": "sh-long-term-care-2026",
    "title": "沪府办规〔2025〕19号：长期护理保险试点办法",
    "url": "https://www.shanghai.gov.cn/nw12344/20251231/51cafb297f0a4397ad30afe0d91ad104.html",
    "authority": "上海市人民政府办公厅",
    "publishedAt": "2025-12-31",
    "effectiveFrom": "2026-01-01",
    "effectiveTo": "2027-12-31",
    "verifiedAt": "2026-10-12",
    "scope": "上海职工医保参保人的长护资金筹集",
    "note": "2025-12-27落款、12-29印发、12-31页面发布。第3/6/25条职工人群按单位医保基数0.5%从职工医保统筹基金调剂，不在单位9%/个人2%外追加现金缴费。"
  },
  "sh-medical-public-fund-definition": {
    "id": "sh-medical-public-fund-definition",
    "title": "上海市职工基本医疗保险办法：地方附加基金性质",
    "url": "https://www.shanghai.gov.cn/xxzfgzwj/20210608/cf17834e28934dc3866d02047416e8c7.html",
    "authority": "上海市人民政府规章库",
    "publishedAt": "2013-10-14",
    "effectiveFrom": "2013-12-01",
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "仅第2/17/40条医保公共基金性质，配合2026当期费率及税法",
    "note": "第2条适用于本市企业职工基本医疗保险，第17条地方附加保险费全入附加基金，第40条纳入社会保障基金财政专户。只证明资金制度性质，不采旧9%+2%单位费率、旧个人账户划入或待遇。"
  },
  'bj-medical-merger-2019': {
    id: 'bj-medical-merger-2019', title: '京医保发〔2019〕30号：生育和职工基本医疗保险合并实施意见',
    url: 'https://ybj.beijing.gov.cn/zwgk/2024zcwj/202406/t20240613_3712088.html', authority: '北京市医保局、财政局、卫生健康委、人社局、税务局',
    publishedAt: '2019-12-27', effectiveFrom: '2020-01-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '北京单位医保费率沿革及个人基数、单位基数汇总口径',
    note: '三（二）合并后单位基本医保含生育9.8%，另大额互助1%，合计10.8%。仅作2021降费前构成证据，不将旧9.8+1直接作为当期费率。',
  },
  'bj-medical-rate-2021': {
    id: 'bj-medical-rate-2021', title: '京医保发〔2021〕1号：调整城镇职工基本医疗保险缴费比例',
    url: 'https://www.beijing.gov.cn/zhengce/zhengcefagui/202101/t20210115_2220135.html', authority: '北京市医疗保障局、财政局',
    publishedAt: '2021-01-13', effectiveFrom: '2021-01-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '北京城镇职工基本医疗保险参保单位缴费比例',
    note: '现行有效正文将现行10.8%降低1个百分点至9.8%。结合2019#30的9.8%+1%=10.8%及2025人社答复、2026缴费图，现行9.8%是单位医疗总比例，不再另加1%互助；这是连续条文推导，不据此推断个人3元税扣资格。',
  },
  'bj-injury-industry': {
    id: 'bj-injury-industry', title: '京人社工发〔2016〕13号：调整北京市工伤保险费率政策',
    url: 'https://rsj.beijing.gov.cn/xxgk/2024zcwj/202406/t20240617_3716666.html', authority: '北京市人力资源和社会保障局、财政局',
    publishedAt: '2016-01-24', effectiveFrom: '2015-10-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '北京按单位参保的工伤行业分类及费率确定机制',
    note: '现行有效；正文二规定政策追溯2015年10月1日，2016年7月前完成调整。八行业基准0.2/0.4/0.7/0.9/1.1/1.3/1.6/1.9%，经办确定行业、旧新费率就低；不以行业基准充当具体企业当期最终费率。',
  },
  'bj-injury-floating': {
    id: 'bj-injury-floating', title: '京人社工发〔2016〕194号：北京市工伤保险浮动费率管理试行办法',
    url: 'https://www.beijing.gov.cn/zhengce/gfxwj/sj/201905/t20190522_59679.html', authority: '北京市人力资源和社会保障局、财政局',
    publishedAt: '2016-10-25', effectiveFrom: '2016-10-08', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '北京普通按单位参保工伤当期核定费率；不含按建设项目参保',
    note: '第3/9/12条经办每年核定7月至次年6月企业费率；第4条浮动档次，第5/7条费率百分数保留小数点后两位四舍五入（并非费用舍入）。输入须为企业确认含浮动及适用减征的最终费率，工具不推断其减征资格。',
  },
  'bj-injury-notice-2026': {
    id: 'bj-injury-notice-2026', title: '关于2026年度工伤保险浮动费率有关问题的通知',
    url: 'https://www.bjxch.gov.cn/xxgk/xxxq/pnidpv1002789.html', authority: '北京市西城区社会保险基金管理中心',
    publishedAt: '2026-08-17', effectiveFrom: null, effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '2026西城区单位工伤浮动费率查询经办事实；不用于给全市企业赋统一费率',
    note: '援引2016#194确认2026已调整，单位可在社保网上服务平台查询业务—工伤保险浮动费率查询下载告知书。只证明当期核定与查询路径，不复用附件中任何企业数据。',
  },
  'bj-medical-current-explanation': {
    id: 'bj-medical-current-explanation', title: '职工医疗保险缴费基数和比例是多少？',
    url: 'https://zyk.bjhd.gov.cn/zwdt/tdzt/2018/csrlsb/cjwtcs/shbxdj/202510/t20251022_4790568.shtml', authority: '北京市海淀区人力资源和社会保障局',
    publishedAt: '2025-10-22', effectiveFrom: null, effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '北京职工医保含生育缴费比例及个人上一年度月均工资基数',
    note: '答复列自2021年起单位9.8%、个人2%+3元，并明确上下限裁切；与2026人社缴费图交叉核验。不用于推断3元个税扣除资格。',
  },
  'zj-employee-base-mapping': {
    id: 'zj-employee-base-mapping', title: '用人单位职工申报年度缴费工资：上年月均工资口径',
    url: 'https://zhejiang.chinatax.gov.cn/art/2025/10/31/art_26351_644153.html', authority: '国家税务总局浙江省税务局',
    publishedAt: '2025-10-31', effectiveFrom: null, effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '浙江普通单位参保职工年度缴费工资申报；含温州',
    note: '现行办事指南第7项按年申报职工上一年度月平均工资。仅用于普通持续在职职工个人基数，不据此将单位基数等同单人基数；新入职等特殊口径排除。',
  },
  'sh-employee-declaration-2026': {
    id: 'sh-employee-declaration-2026', title: '上海市税务局通告2026年第1号：2026社保年度职工缴费工资申报',
    url: 'https://shanghai.chinatax.gov.cn/zcfw/zcfgk/sbf/202604/t480144.html', authority: '国家税务总局上海市税务局',
    publishedAt: '2026-04-28', effectiveFrom: '2026-07-01', effectiveTo: '2027-06-30', verifiedAt: '2026-10-12',
    scope: '上海普通在职职工2026社保年度上一自然年度工资申报',
    note: '成文4月24日、发布4月28日，全文有效；第3项按2025年月均工资，不满年按实际月数，新招录按起薪月全月工资。仅普通连续在職情景继承上一年月均mapping。',
  },
  'sh-medical-2026': {
    id: 'sh-medical-2026', title: '沪医保规〔2026〕2号：继续阶段性降低职工基本医疗保险费费率',
    url: 'https://ybj.sh.gov.cn/gfxwj/20260313/921e047144694b61b6df8ca0c5ef2cfc.html', authority: '上海市医保局、财政局、人社局、税务局',
    publishedAt: '2026-03-10', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', verifiedAt: '2026-10-12',
    scope: '上海职工基本医疗保险缴费',
    note: '第1条个人2%；单位9%=基本医保含生育8.5%+地方附加0.5%，不重复加生育。仅单项；不凭本通知证明其他项目或长期护理额外个人负担不存在。',
  },
  'bj-employee-base-mapping': {
    id: 'bj-employee-base-mapping', title: '京劳社保发〔2007〕32号：统一社会保险缴费基数口径',
    url: 'https://rsj.beijing.gov.cn/xxgk/2024zcwj/202406/t20240617_3717433.html',
    authority: '北京市劳动和社会保障局', publishedAt: '2007-02-28', effectiveFrom: '2007-04-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '北京普通单位职工上一年度月均工资与单位基数汇总关系',
    note: '官网现行有效；只采第1条个人上一年度月均工资、单位为个人基数之和。历史限额/农民工分支不沿用。正文第7条实施日4月1日与页面元数据不一致，以正文登记；整数元为本工具精度子域。',
  },
  'bj-employee-declaration-2026': {
    id: 'bj-employee-declaration-2026', title: '2026年度用人单位和灵活就业人员社会保险缴费工资申报通告',
    url: 'https://www.beijing.gov.cn/zhengce/zhengcefagui/202606/t20260615_4701113.html',
    authority: '北京市税务局、人社局、医保局、北京住房公积金管理中心（政府门户全文）', publishedAt: '2026-06-09', effectiveFrom: null, effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '2026年度单位职工缴费工资申报及社保公积金数据共享',
    note: '有效正式全文第3条以2025自然年度月平均工资申报；第4条可授权公积金取已申报工资。当前月薪等于上一年度月均仅是显式情景假设，不是法定等式。',
  },
  'bj-housing-base-mapping-2026': {
    id: 'bj-housing-base-mapping-2026', title: '2026住房公积金年度缴存政策解读：上一年度工资口径',
    url: 'https://www.beijing.gov.cn/zhengce/zcjd/202608/t20260825_4835519.html',
    authority: '北京住房公积金管理中心（政府门户转载）', publishedAt: '2026-08-24', effectiveFrom: '2026-07-01', effectiveTo: '2027-06-30', verifiedAt: '2026-10-12',
    scope: '普通正常缴存职工2025年月平均工资与2026公积金年度',
    note: '采用2025自然年度月平均工资，按年度上下限核定；不将新参加工作/新调入、特殊分中心、生活费、低薪减免、降缓缴纳入普通情景。',
  },
  'iit-contribution-deduction': {
    id: 'iit-contribution-deduction', title: '财税〔2006〕10号：三险一金个人所得税扣除范围与限额',
    url: 'https://fgk.chinatax.gov.cn/zcfgk/c102416/c5203070/content.html',
    authority: '财政部、国家税务总局', publishedAt: '2006-06-27', effectiveFrom: '2006-06-27', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '按规定实际缴付的基本三险及限额内住房公积金',
    note: '第1条基本三险须国家/省政府规定比例或办法；第2条公积金分别本人上年月均12%且基数不超工作地设区市上年职工月均3倍。不得据此将北京3元大额互助或全部地方缴存金额自动认定可扣；地方税前限额与舍入需另核。',
  },
  'social-insurance-law': {
    id: 'social-insurance-law', title: '中华人民共和国社会保险法（2018年修正）', url: 'https://wjw.hubei.gov.cn/bmdt/ztzl/hbzyjk/fgbz__/202207/t20220701_4200696.shtml',
    authority: '全国人大常委会（湖北省卫健委转载）', publishedAt: '2018-12-29', effectiveFrom: '2018-12-29', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '职工与单位缴费主体、代扣及缴费记录', note: '第12/23/33/44/53/60/74条。仅用于已核定金额的个人/单位支出归属，不从本法推断地方2026比例、基数、舍入或参保资格。',
  },
  'housing-fund-2026': {
    id: 'housing-fund-2026', title: '住房公积金管理条例（国务院令844号，2026年修订）', url: 'https://www.mee.gov.cn/zcwj/gwywj/202608/t20260820_1164286.shtml',
    authority: '国务院（生态环境部官方转载）', publishedAt: '2026-08-10', effectiveFrom: '2026-09-20', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '公积金个人及单位缴存、工资代扣及单位成本归属', note: '现行第16、19、23条。地方比例/基数/特殊免缴/舍入另有规则，本版实缴模式不推算这些数值。',
  },
  'retirement-reform': {
    id: 'retirement-reform', title: '2024年延迟法定退休年龄决定与出生年月对照表', url: 'https://www.mot.gov.cn/hudong/xiangguanziliao/202601/t20260114_4197321.html',
    authority: '全国人大常委会、国务院（交通运输部官方转载）', publishedAt: '2024-09-13', effectiveFrom: '2025-01-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '普通职工原50/55/60周岁类别；最低缴费年限2025—2039及以后', note: '按出生年月查表，不以性别代替人员类别。2030起每年增加6个月，2039达到240个月。远期按本次政策快照，非未来不变承诺。',
  },
  'retirement-flexible': {
    id: 'retirement-flexible', title: '人社部发〔2024〕94号：实施弹性退休制度暂行办法', url: 'https://hrss.sz.gov.cn/xxgk/qtxx/tzgg/content/post_11934292.html',
    authority: '人社部、中组部、财政部（深圳人社转载）', publishedAt: '2024-12-31', effectiveFrom: '2025-01-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '符合普通职工弹性退休适用条件者', note: '提前按选择年份最低年限；延迟按法定年龄对应年份。2024年底前已达原法定年龄者不适用。程序、身份与特殊人员限制需另行核定。',
  },
  'pension-divisor': {
    id: 'pension-divisor', title: '国发〔2005〕38号及个人账户养老金计发月数表', url: 'https://fgk.chinatax.gov.cn/zcfgk/c102440/c5193739/content.html',
    authority: '国务院（国家税务总局法规库）', publishedAt: '2005-12-03', effectiveFrom: '2006-01-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '企业职工个人账户养老金整周岁计发月数', note: '本版仅引用整周岁计发月数附件；正文旧最低15年和其他历史处理不覆盖后续延退、社会保险法及地方新规定。非整周岁不自行插值或取整。',
  },
  'pension-window': {
    id: 'pension-window', title: '计发月数不是养老金领取截止期限', url: 'https://rsj.sh.gov.cn/trdhy_17355/20211015/t0035_1403121.html',
    authority: '上海市人力资源和社会保障局', publishedAt: '2021-09-13', effectiveFrom: null, effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '养老金领取期限说明（主管部门答复）', note: '领取窗口是用户选择的算术累计期间；不意味着待遇到期，也不包含未来待遇调整或特殊停发情形。金额计发采用2026年新办法。',
  },
  'pension-transfer': {
    id: 'pension-transfer', title: '国办发〔2009〕66号：跨省转移接续与待遇领取地', url: 'https://www.beijing.gov.cn/zhengce/gwywj/201001/t20100101_781119.html',
    authority: '国务院办公厅（北京市政府转载）', publishedAt: '2009-12-28', effectiveFrom: '2010-01-01', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '城镇企业职工跨省基本养老保险关系', note: '页面标有效。第六条按基本关系、户籍、最后满10年原参保地顺序确定；第十一条省内办法另定。本版仅根据已核定的普通关系做省级判断，临时及特殊情况禁用，不拼接各地养老金。',
  },
  'pension-transfer-2016': {
    id: 'pension-transfer-2016', title: '人社部规〔2016〕5号：跨省养老关系转移接续若干问题',
    url: 'https://hrss.sz.gov.cn/gkmlpt/content/5/5528/post_5528907.html',
    authority: '人力资源和社会保障部（深圳人社转载）', publishedAt: '2016-11-28', effectiveFrom: '2016-11-28', effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '企业职工跨省关系，省级年限归属、临时账户与户籍零参保归集', note: '第一/三/八/九条；2018-05-25为转载日期。与2009年187号、2010年70号、2013年250号不一致处以本通知为准。未发现废止，2026政府解释佐证核心分支；本版特殊归属情况拒判。',
  },
  'pension-transfer-current': {
    id: 'pension-transfer-current', title: '2026年多地工作后领取养老金地点：省级四分支说明',
    url: 'https://www.suzhou.gov.cn/szsrmzf/rdwd/202609/d935e3eda17c48b1b7ce031fef41bfc5.shtml',
    authority: '苏州市人民政府（苏州社保）', publishedAt: '2026-09-20', effectiveFrom: null, effectiveTo: null, verifiedAt: '2026-10-12',
    scope: '全国跨省领取地四分支的当前解释', note: '用于佐证2026仍按省级户籍、关系和十年顺序判断；不采用其省内口径推断浙江温州市经办地。',
  },
  'iit-law': {
    id: 'iit-law', title: '中华人民共和国个人所得税法（现行全文有效）',
    url: 'https://fgk.chinatax.gov.cn/zcfgk/c100009/c5193028/content.html',
    authority: '国家税务总局政策法规库', publishedAt: '2018-08-31', effectiveFrom: '2019-01-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '中国大陆居民个人综合所得；第六条、第十一条、综合所得税率表',
    note: '法规库核验标记全文有效。年度收入额与税前收入并非始终相等；首版年度入口只接受已经依法转换的综合所得收入额与经核实扣除额。',
  },
  'iit-withholding': {
    id: 'iit-withholding', title: '国家税务总局公告2018年第61号：累计预扣公式',
    url: 'https://fgk.chinatax.gov.cn/zcfgk/c100012/c5194838/content.html',
    authority: '国家税务总局', publishedAt: '2018-12-21', effectiveFrom: '2019-01-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '居民个人工资薪金；同一扣缴单位、同一税年普通累计预扣',
    note: '法规库标全文有效。普通累计预扣负差额本期不退；首版不含首年入职/低收入特殊扣除办法、奖金单独计税、减免税或非居民。',
  },
  'iit-table': {
    id: 'iit-table', title: '综合所得税率及速算扣除数（官方附件）',
    url: 'https://shanghai.chinatax.gov.cn/zcfw/zcfgk/grsds/202402/P020240202362406243753.pdf',
    authority: '国家税务总局上海市税务局', publishedAt: '2024-02-02', effectiveFrom: '2019-01-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '居民个人综合所得年度税表', note: '7档税率与速算扣除数；税额按分计算。',
  },
  'sh-retirement-month-payment': {
    id: 'sh-retirement-month-payment', title: '退休当月缴费：企业正常缴纳、灵活就业已满年限可选择',
    url: 'https://rsj.sh.gov.cn/tyljlqtj_17556/20260911/t0035_1443669.html',
    authority: '上海市人力资源和社会保障局', publishedAt: '2026-09-11', effectiveFrom: null, effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '上海企业职工到龄退休月；已满足法定缴费年限的灵活就业参保人',
    note: '官方现行问答：企业职工退休当月仍在职，单位正常缴纳；灵活就业已满法定缴费年限可自愿缴或不缴该月。未来仅冻结该口径作方案，不承诺届时政策。',
  },
  'sh-pension-2026': {
    id: 'sh-pension-2026', title: '沪人社规〔2026〕16号：本市企业基本养老金计发办法',
    url: 'https://www.shanghai.gov.cn/gwk/search/content/t0035_1443100',
    authority: '上海市人力资源和社会保障局', publishedAt: '2026-07-24', effectiveFrom: '2026-08-16', effectiveTo: '2031-08-15',
    verifiedAt: '2026-10-12', scope: '待遇领取地确认为上海的企业职工基本养老保险参保人',
    note: '2021年32号、27号已废止。缴费月折年保留4位；基础、个人账户、过渡性分项分别见分进角。首版只开放无过渡性、无视同缴费人员的固定规则参数情景；不核定实际权益。',
  },
  'bj-contribution-2026': {
    id: 'bj-contribution-2026', title: '京人社发〔2026〕7号：2026年度社保缴费基数上下限',
    url: 'https://rsj.beijing.gov.cn/xxgk/2024zcwj/202608/t20260821_4831461.html',
    authority: '北京市人力资源和社会保障局等部门', publishedAt: '2026-08-21', effectiveFrom: '2026-07-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '北京2026年7月起普通职工及通知限定渠道个人参保',
    note: '社保基数7270—36348元；此文件不构成完整五险一金金额或地方舍入规则，缺项仍拒算。',
  },
  'bj-contribution-rates-2026': {
    id: 'bj-contribution-rates-2026', title: '北京2026社保基数调整后的各险种比例与个人参保说明',
    url: 'https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202608/t20260827_4839720.html',
    authority: '北京市人力资源和社会保障局（市政府转载）', publishedAt: '2026-08-27', effectiveFrom: '2026-07-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '北京普通职工及通知限定渠道个人参保',
    note: '官方比例图片明确职工养老个人8%、单位16%；正文个人参保养老20%。本版另支持通知限定个人参保养老20%、失业1%及医保固定额；整数元基数使前两项恰到分，不推定职工各险种舍入。',
  },
  'sh-contribution-base-2026': {
    id: 'sh-contribution-base-2026', title: '上海2026年度社保缴费基数上下限',
    url: 'https://rsj.sh.gov.cn/tgsgg_17341/20260818/t0035_1443203.html',
    authority: '上海市人力资源和社会保障局', publishedAt: '2026-08-18', effectiveFrom: '2026-07-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '上海2026年7月起社会保险缴费基数',
    note: '上下限7546—37731元；本版养老缴费单项只核验2026-10，不自动延展未来月份。',
  },
  'sh-flexible-pension': {
    id: 'sh-flexible-pension', title: '沪人社规〔2024〕3号：灵活就业养老缴费比例20%',
    url: 'https://www.shanghai.gov.cn/nw12344/20240228/1fa3b59ef795429f9bc3cfd7b6599ceb.html',
    authority: '上海市人力资源和社会保障局、国家税务总局上海市税务局', publishedAt: '2024-02-28', effectiveFrom: '2024-03-01', effectiveTo: '2028-04-30',
    verifiedAt: '2026-10-12', scope: '符合上海灵活就业职工养老参保条件者',
    note: '将灵活就业养老缴费比例从24%调整为20%；不能套作单位职工个人缴费比例。',
  },
  'sh-flexible-population': {
    id: 'sh-flexible-population', title: '沪人社规〔2023〕5号：灵活就业参保条件与缴费',
    url: 'https://www.shanghai.gov.cn/grshbxsjzc/20241112/dc9f6287c6d04c4badc4fe906981f986.html',
    authority: '上海市人力资源和社会保障局等部门', publishedAt: null, effectiveFrom: '2023-05-01', effectiveTo: '2028-04-30',
    verifiedAt: '2026-10-12', scope: '上海已核定灵活就业职工养老参保身份与自选基数',
    note: '旧养老24%已被2024年3号修改，旧退休年龄和年限须衔接延退新规。本版只引用参保身份、基数及按月缴费，不引用旧比例或旧退休门槛。',
  },
  'zj-unemployment-expiry': {
    id: 'zj-unemployment-expiry', title: '杭州税务2026年5月答复：阶段性社保降费政策期限',
    url: 'https://zhejiang.chinatax.gov.cn/art/2026/5/6/art_13129_654020.html',
    authority: '国家税务总局杭州市税务局', publishedAt: '2026-05-06', effectiveFrom: null, effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '2026年5月6日对降费政策是否续期的官方答复；不是2026全年费率表',
    note: '答复称阶段性降低失业保险费率政策截至2025年底、答复当时未有延续规定。未取得其后适用通知前，不将往年1%自动延用于浙江2026年10月。此来源用于说明证据缺口，不用于设定现行费率。',
  },
  'zj-contribution-base-2026': {
    id: 'zj-contribution-base-2026', title: '浙人社发〔2026〕52号：2026年社会保险有关基数',
    url: 'https://rlsbt.zj.gov.cn/col/col1229506773/art/2026/art_2b4555c11a034b9e874038cbff2f84fb.html',
    authority: '浙江省人力资源和社会保障厅等五部门', publishedAt: '2026-10-08', effectiveFrom: '2026-01-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '浙江2026年度社会保险基数；包括温州',
    note: '原文标有效，统一编号ZJSP13-2026-0006。2026起恢复以上年度省平60%为下限；2026上下限5122—25611元。2026待遇计算采用2025年省加权工资；不据此假定待遇总额只有两个组成项。',
  },
  'zj-contribution-explanation-2026': {
    id: 'zj-contribution-explanation-2026', title: '浙江2026年度社保基数政策解读：养老缴费比例与计发参数',
    url: 'https://rlsbt.zj.gov.cn/col/col1229101513/art/2026/art_e8b496ab59834390884b8d375cff1651.html',
    authority: '浙江省人力资源和社会保障厅', publishedAt: '2026-10-08', effectiveFrom: '2026-01-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '浙江2026年度职工、灵活就业养老；包括温州',
    note: '月加权工资8537元；养老个人8%、单位16%、灵活就业20%。个人账户记入规则与实际缴费总额不同；本版暂不算个人账户或全部养老金。',
  },
  'zj-flexible-population': {
    id: 'zj-flexible-population', title: '浙人社发〔2021〕63号：灵活就业参加企业职工养老',
    url: 'https://rlsbt.zj.gov.cn/art/2021/12/1/art_1229506773_2377609.html',
    authority: '浙江省人力资源和社会保障厅', publishedAt: '2021-12-01', effectiveFrom: '2021-12-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '在浙江就业并符合登记条件的灵活就业职工养老参保人员',
    note: '省内户籍在户籍地或就业登记后在就业地参保；外省户籍在省内就业地登记后参保。2022起20%，不代表居民制度；不能从能参保推出能在温州领取退休待遇。旧年龄文字须衔接国家改革。',
  },
  'zj-pension-additions': {
    id: 'zj-pension-additions', title: '浙人社发〔2011〕146号：养老金补贴与过渡性调节金',
    url: 'https://rlsbt.zj.gov.cn/art/2014/3/1/art_1229506773_308227.html',
    authority: '浙江省人力资源和社会保障厅', publishedAt: '2011-04-29', effectiveFrom: '2011-01-01', effectiveTo: null,
    verifiedAt: '2026-10-12', scope: '浙江企业退休人员基本养老金组成；不直接作为2026完整金额包',
    note: '页面标有效。基本养老金补贴与另发过渡性调节金不能因无视同/无过渡性养老金而忽略；2026调节金参数及完整尾数链未核齐，本站不算浙江养老金总额。2014-03-01是网页转载日期。',
  },

  "bj-housing-2026": {
    "id": "bj-housing-2026",
    "title": "京房公积金管委会办〔2026〕6号：2026住房公积金年度缴存",
    "url": "https://www.beijing.gov.cn/zhengce/zhengcefagui/202608/t20260824_4834975.html",
    "authority": "北京住房公积金管理委员会办公室",
    "publishedAt": "2026-08-24",
    "effectiveFrom": "2026-07-01",
    "effectiveTo": "2027-06-30",
    "verifiedAt": "2026-10-12",
    "scope": "北京普通企业正常缴存",
    "note": "现行有效；基数2540—36348元，单方5%—12%。基本生活费、困难降缓及特殊分中心等不适用本版普通模型。"
  },
  "bj-housing-calculation": {
    "id": "bj-housing-calculation",
    "title": "北京住房公积金2018年第24号政策解读：比例与逐方整元舍入",
    "url": "https://gjj.beijing.gov.cn/web/zwgk61/2024zcjd/436439572/index.html",
    "authority": "北京住房公积金管理中心",
    "publishedAt": "2018-06-22",
    "effectiveFrom": null,
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "普通企业正常职工缴存的一般计算方式",
    "note": "Q2整数百分比且双方相同、Q4特殊分中心、Q10每方四舍五入到元、Q12个人减缴。只继承与2026通知相容的一般规则，不使用2018年度限额。"
  },
  "bj-housing-general": {
    "id": "bj-housing-general",
    "title": "京房公积金〔2018〕24号：关于做好降缓缴和跨年清册核定有关工作的通知",
    "url": "https://gjj.beijing.gov.cn/web/zwgk61/2024zcwj/436433464/436433466/436439062/index.html",
    "authority": "北京住房公积金管理中心",
    "publishedAt": "2018-06-22",
    "effectiveFrom": null,
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "北京普通企业缴存一般规则",
    "note": "成文2018-06-20、网页发布2018-06-22，官方标现行有效；年度上下限由2026通知替代。特殊分中心、低薪个人减免及批准降缓不在本工具范围。"
  },
  "bj-housing-cap-table": {
    "id": "bj-housing-cap-table",
    "title": "北京2026住房公积金各档月缴存额上限表（官方附件）",
    "url": "https://www.beijing.gov.cn/zhengce/zhengcefagui/202608/W020260824660023500449.png",
    "authority": "北京住房公积金管理委员会办公室",
    "publishedAt": "2026-08-24",
    "effectiveFrom": "2026-07-01",
    "effectiveTo": "2027-06-30",
    "verifiedAt": "2026-10-12",
    "scope": "北京普通正常5%—12%各整数比例",
    "note": "独立目视核验：36348元按12%每方4362元、合计8724元；不是未舍入总额直接取整。"
  },
  "wz-housing-2026": {
    "id": "wz-housing-2026",
    "title": "温州2026年度住房公积金月缴存额调整通知",
    "url": "https://zfgjj.wenzhou.gov.cn/col/col1229322000/art/2026/art_fd85adf3b33f40d1b71719996c87c4d0.html",
    "authority": "温州市住房公积金管理中心",
    "publishedAt": "2026-07-22",
    "effectiveFrom": "2026-07-01",
    "effectiveTo": "2027-06-30",
    "verifiedAt": "2026-10-12",
    "scope": "温州各县区普通企业职工及限定灵活缴存人",
    "note": "成文7月10日、发布7月22日；7月18日起办理调整，所属期7月至次年6月。职工两方分别整元四舍五入；灵活总额先除2、整元四舍五入、再乘2。贷款历史月额约束、补退差额及特殊类型不在本版。"
  },
  "bj-personal-shared-base": {
    "id": "bj-personal-shared-base",
    "title": "北京2026个人社保年度基数申报：养老与失业基数一致",
    "url": "https://www.bjfsh.gov.cn/zhxw/fsdt/202606/t20260623_40114788_fs.shtml",
    "authority": "北京市房山区人民政府（官方转载）",
    "publishedAt": "2026-06-23",
    "effectiveFrom": null,
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "北京规定个人参保渠道的养老与失业基数申报",
    "note": "仅引用养老和失业缴费基数应一致；上下限及固定医保额采用随后2026年第7号。本站未将此政府转载标为已读税务原始网页。"
  },
  "zj-pension-provincial": {
    "id": "zj-pension-provincial",
    "title": "浙政发〔2020〕31号：企业职工基本养老保险省级统筹",
    "url": "https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3096/site/attach/0/3439601032614526acf4ec4be09d4075.pdf",
    "authority": "浙江省人民政府",
    "publishedAt": "2020-12-15",
    "effectiveFrom": "2020-12-15",
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "浙江全省企业职工基本养老保险（包括温州）",
    "note": "打印页2、4、8：省统一计发办法、统筹项目和调整标准；地方不得自行增项提标，特殊历史过渡须省批准。不要求温州重复发布省级公式，也不以省统筹推断市县医保、公积金一致。"
  }
,

  "bj-pension-formula": {
    "id": "bj-pension-formula",
    "title": "京劳社养发〔2007〕21号：基本养老金计发办法",
    "url": "https://www.beijing.gov.cn/zhengce/zhengcefagui/qtwj/200804/t20080414_567066.html",
    "authority": "北京市劳动和社会保障局",
    "publishedAt": "2008-04-14",
    "effectiveFrom": "2007-01-01",
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "北京企业职工基础养老金标准分项（含核定视同年限）；个人账户入口仍限原新人子域",
    "note": "成文2007-02-08，门户现行有效。第七条与183号同步实施；不延用旧退休年龄和年限门槛。本版仅经办已核定参数的分项算式复核，不内置未核2026计发基数。"
  },
  "bj-pension-formula-attachment": {
    "id": "bj-pension-formula-attachment",
    "title": "北京2007年第21号附件：基础与个人账户计发公式",
    "url": "https://www.beijing.gov.cn/zhengce/zhengcefagui/qtwj/200804/W020220330418424006988.png",
    "authority": "北京市劳动和社会保障局",
    "publishedAt": "2008-04-14",
    "effectiveFrom": "2007-01-01",
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "北京经办已核定基础计发工资平均值、全部年限及账户分项公式；不据此自动核定总待遇",
    "note": "官方附件独立目视：B=(C+C×I)/2，基础B×N×1%；C两位、I四位、N到月保留两位。工具不自行重建上游中间值；仅输出无需尾数处理且精确到角的单项。"
  },
  "zj-pension-formula": {
    "id": "zj-pension-formula",
    "title": "浙劳社老〔2006〕142号：完善企业职工基本养老保险制度实施办法",
    "url": "https://rlsbt.zj.gov.cn/art/2014/2/24/art_1229506773_307562.html",
    "authority": "浙江省劳动和社会保障厅、浙江省财政厅",
    "publishedAt": "2014-02-24",
    "effectiveFrom": "2006-01-01",
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "浙江含温州标准基础分项（第14/15条，含普通中人）；个人账户入口仍限原新人子域",
    "note": "成文2006-09-19，第46条2006-01-01起，页面标有效。14(1)基础为省待遇计发工资与本人指数化工资均值×年限×1%，14(2)账户除计发月数；15(1)中人基础公式同第14条；17条双低另乘系数、19条老退休旧法均排除，21条2011起不再新老比较；18条年限到月、指数4位。未据此宣称浙江年限法定保留2位。工具仅收经办核定中间值。旧退休门槛由新法衔接。"
  },
  "zj-pension-new-entrant": {
    "id": "zj-pension-new-entrant",
    "title": "浙劳社老〔2007〕7号：关于完善企业职工基本养老保险制度有关问题的补充通知",
    "url": "https://rlsbt.zj.gov.cn/art/2014/2/25/art_1229506773_307694.html",
    "authority": "浙江省劳动和社会保障厅",
    "publishedAt": "2014-02-25",
    "effectiveFrom": null,
    "effectiveTo": null,
    "verifiedAt": "2026-10-12",
    "scope": "浙江1998-01-01以后首次参保普通新人适用边界",
    "note": "成文2007-01-15，页面标有效；第一条新人边界，仅引用人群，不据旧文推定2026总额只有基础与个人账户。独立实施日未明确，不编造。"
  }
,
};

export const LABOR_TAX_RULE: TaxRule = {
  id: 'cn-resident-iit-2026', sourceIds: ['iit-law', 'iit-withholding', 'iit-table'],
  scope: { region: '中国大陆', population: '居民个人普通工资薪金与已核实的综合所得收入额', validFrom: '2026-01-01', validTo: '2026-12-31', verifiedOn: '2026-10-12' },
  annualDeductionCents: 6000000, monthlyDeductionCents: 500000,
  brackets: [
    { upToCents: 3600000, rateBps: 300, quickDeductionCents: 0 },
    { upToCents: 14400000, rateBps: 1000, quickDeductionCents: 252000 },
    { upToCents: 30000000, rateBps: 2000, quickDeductionCents: 1692000 },
    { upToCents: 42000000, rateBps: 2500, quickDeductionCents: 3192000 },
    { upToCents: 66000000, rateBps: 3000, quickDeductionCents: 5292000 },
    { upToCents: 96000000, rateBps: 3500, quickDeductionCents: 8592000 },
    { upToCents: null, rateBps: 4500, quickDeductionCents: 18192000 },
  ],
};

/** Explicit ordinary-employee scenarios; October is the verified product window, not a legal expiry. */
const bjAutoScope = {
  region: '北京', population: '普通企业整月正常在职；非新参保/调入特殊月；非按建设项目参保工伤；公积金非中直/国管/铁路分中心，无生活费、低薪减缴、降缓缴及补退调整',
  validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12',
};
const bjAutoSocialBase: AutoContributionItemRule['base'] = {
  minimumCents: 727000, maximumCents: 3634800, stepCents: 100, mapping: 'prior-average-wage',
  mappingSourceIds: ['bj-employee-base-mapping', 'bj-employee-declaration-2026'],
};
const bjAutoHousingBase: AutoContributionItemRule['base'] = {
  minimumCents: 254000, maximumCents: 3634800, stepCents: 100, mapping: 'prior-average-wage',
  mappingSourceIds: ['bj-housing-base-mapping-2026', 'bj-employee-declaration-2026'],
};
const bjAutoRules: AutoContributionRule[] = [{
  id: 'bj-ordinary-auto-202610', city: 'beijing', scope: bjAutoScope,
  sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026', 'bj-medical-current-explanation', 'bj-medical-merger-2019', 'bj-medical-rate-2021', 'bj-injury-industry', 'bj-injury-floating', 'bj-injury-notice-2026', 'bj-employee-base-mapping', 'bj-employee-declaration-2026', 'bj-housing-2026', 'bj-housing-general', 'bj-housing-cap-table', 'bj-housing-calculation', 'bj-housing-base-mapping-2026', 'social-insurance-law'],
  personalZeroBurdenSourceIds: ['social-insurance-law', 'bj-contribution-rates-2026'],
  items: [...(['personal', 'employer'] as const).flatMap((payer): AutoContributionItemRule[] => [
    { id: 'pension', payer, label: '基本养老保险', base: bjAutoSocialBase, rateBps: payer === 'personal' ? 800 : 1600, fixedCents: 0, rounding: 'exact-cent',
      scope: bjAutoScope, sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026'] },
    { id: 'medical', payer, label: payer === 'personal' ? '医疗保险（个人2%及3元大额互助；生育不另缴）' : '医疗保险（含生育及大额互助的单位总缴费）', base: bjAutoSocialBase, rateBps: payer === 'personal' ? 200 : 980, fixedCents: payer === 'personal' ? 300 : 0, rounding: 'exact-cent',
      scope: bjAutoScope, sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026', 'bj-medical-current-explanation', 'bj-medical-merger-2019', 'bj-medical-rate-2021'] },
    { id: 'unemployment', payer, label: '失业保险', base: bjAutoSocialBase, rateBps: 50, fixedCents: 0, rounding: 'exact-cent',
      scope: bjAutoScope, sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026'] },
    { id: 'housing', payer, label: '住房公积金', base: bjAutoHousingBase, rateBps: 500, fixedCents: 0, rounding: 'half-up-yuan',
      rateRange: { minimumBps: 500, maximumBps: 1200, stepBps: 100 }, minimumGrossAfterPersonalHousingCents: 254000,
      scope: bjAutoScope, sourceIds: ['bj-housing-2026', 'bj-housing-general', 'bj-housing-calculation', 'bj-housing-cap-table'] },
  ]), {
    id: 'injury', payer: 'employer', label: '工伤保险（企业当期核定最终费率）', base: bjAutoSocialBase,
    rateBps: 0, rateInput: 'employer-injury-confirmed',
    rateInputNote: '请按企业当期经办核定文件填最终费率，已含行业、浮动及适用减征，不再次叠加；百分比支持两位小数。0.01%–100%仅为产品技术输入范围，不是北京法定费率上下限。',
    rateRange: { minimumBps: 1, maximumBps: 10000, stepBps: 1 }, fixedCents: 0, rounding: 'exact-cent',
    scope: bjAutoScope, sourceIds: ['bj-contribution-2026', 'bj-employee-base-mapping', 'bj-injury-industry', 'bj-injury-floating', 'bj-injury-notice-2026'],
  }],
}];

/** A conservative proof subset; neither a housing tax-cap assertion nor a ruling on mutual aid. */
export const LABOR_FROZEN_ZERO_TAX_RULES: FrozenZeroTaxProofRule[] = [{
  id: 'bj-frozen-zero-proof-202610', city: 'beijing', contributionRuleIds: ['bj-ordinary-auto-202610'],
  tax: LABOR_TAX_RULE,
  scope: { ...bjAutoScope, population: `${bjAutoScope.population}；居民普通现金工资，无其他收入、奖金或福利；单位普通法定缴费；固定规则12期比较，仅税基保守上界不大于零时开放` },
  sourceIds: [...new Set([...bjAutoRules[0].sourceIds, ...LABOR_TAX_RULE.sourceIds, 'iit-contribution-deduction'])],
  certainPensionDeduction: { scope: bjAutoScope, sourceIds: ['iit-contribution-deduction', 'bj-contribution-2026', 'bj-contribution-rates-2026', 'bj-employee-base-mapping'] },
  employerHousingTaxableBound: { scope: bjAutoScope, sourceIds: ['iit-law', 'iit-contribution-deduction', 'bj-housing-2026'] },
  employerMedicalTaxableBound: { scope: bjAutoScope, sourceIds: ['iit-law', 'bj-medical-merger-2019', 'bj-medical-rate-2021'] },
  ordinaryEmployerSocialExemption: { scope: bjAutoScope, sourceIds: ['iit-contribution-deduction', 'social-insurance-law', 'bj-contribution-rates-2026'] },
}];

export const LABOR_PAYROLL_RULES: PayrollRule[] = [];
export const LABOR_CONTRIBUTION_RULES: ContributionPeriodRule[] = [];
/** Complete month and integer-yuan bases only; never a complete five-insurance package. */
export const LABOR_PENSION_CONTRIBUTION_ITEMS: PensionContributionItemRule[] = [
  { id: 'bj-pension-employee-202610', regime: 'employee', minimumBaseYuan: 7270, maximumBaseYuan: 36348, personalRatePercent: 8, employerRatePercent: 16,
    sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026'], scope: { region: '北京', population: '普通企业职工；已核定整数元养老基数，无补缴等特殊处理', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' } },
  { id: 'bj-pension-flexible-202610', regime: 'flexible', minimumBaseYuan: 7270, maximumBaseYuan: 36348, personalRatePercent: 20, employerRatePercent: 0,
    sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026'], scope: { region: '北京', population: '在人社公共服务中心等代理机构个人存档、街道乡镇便民服务中心通知规定渠道参保；身份及整数元基数已核定', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' } },
  { id: 'sh-pension-flexible-202610', regime: 'flexible', minimumBaseYuan: 7546, maximumBaseYuan: 37731, personalRatePercent: 20, employerRatePercent: 0,
    sourceIds: ['sh-contribution-base-2026', 'sh-flexible-pension', 'sh-flexible-population'], scope: { region: '上海', population: '符合沪人社规2023年5号灵活就业职工养老参保条件；身份及整数元基数已核定', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' } },
  { id: 'zj-pension-employee-202610', regime: 'employee', minimumBaseYuan: 5122, maximumBaseYuan: 25611, personalRatePercent: 8, employerRatePercent: 16,
    sourceIds: ['zj-contribution-base-2026', 'zj-contribution-explanation-2026'], scope: { region: '浙江（含温州）', population: '普通企业职工（不含有雇工个体工商户及其雇工）；已核定整数元养老基数，无补缴等特殊处理', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' } },
  { id: 'zj-pension-flexible-202610', regime: 'flexible', minimumBaseYuan: 5122, maximumBaseYuan: 25611, personalRatePercent: 20, employerRatePercent: 0,
    sourceIds: ['zj-contribution-base-2026', 'zj-contribution-explanation-2026', 'zj-flexible-population'], scope: { region: '浙江（含温州）', population: '符合浙江就业/登记规定、经办已确认灵活就业职工养老身份及整数元基数；不含城乡居民养老', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' } },
];
export const LABOR_VERIFIED_PAYROLL_RULE: VerifiedPayrollRule = {
  id: 'cn-verified-payroll-2026q4', tax: LABOR_TAX_RULE,
  employerCostSourceIds: ['social-insurance-law', 'housing-fund-2026'],
  employerCostScope: { region: '中国大陆（单位实缴金额模式）', population: '普通企业工资与已核定单位社保、公积金支出；无须个人个税累计背景，不自动核定参保及地方费率', validFrom: '2026-10-01', validTo: '2026-12-31', verifiedOn: '2026-10-12' },
  sourceIds: ['social-insurance-law', 'housing-fund-2026', 'iit-law', 'iit-withholding', 'iit-table'],
  scope: { region: '中国大陆（缴费金额由经办核定）', population: '居民普通工资；已核定实扣与依法可扣金额；无特殊税收处理', validFrom: '2026-10-01', validTo: '2026-12-31', verifiedOn: '2026-10-12' },
};
export const LABOR_PENSION_RULES: PensionRule[] = [{
  id: 'sh-pension-2026-16', regime: 'employee', supportedPopulation: '上海企业职工基本养老，无视同或过渡性待遇',
  sourceIds: ['sh-pension-2026', 'pension-divisor', 'pension-window', 'pension-transfer', 'retirement-reform'],
  scope: { region: '上海', population: '领取地、资格、缴费月数、指数与账户须核定；无视同及过渡性待遇；仅参数情景', validFrom: '2026-08-16', validTo: '2031-08-15', verifiedOn: '2026-10-12' },
  baseRateBps: 100, serviceYearDecimals: 4, componentRounding: 'ceil-jiao', totalRounding: 'ceil-jiao',
  supportedRetirementYears: [2026], minimumContributionMonths: 180, minimumRetirementAgeMonths: 600, maximumRetirementAgeMonths: 792,
  accountDivisors: { 50: 195, 51: 190, 52: 185, 53: 180, 54: 175, 55: 170, 56: 164, 57: 158, 58: 152, 59: 145, 60: 139, 61: 132, 62: 125, 63: 117, 64: 109, 65: 101, 66: 93 },
}];
export const LABOR_RETIREMENT_RULE: RetirementRule = {
  id: 'cn-retirement-2024-snapshot-20261012', sourceIds: ['retirement-reform', 'retirement-flexible'],
  scope: { region: '中国大陆', population: '经确认原法定退休年龄类别的普通企业职工；不含特殊退休与身份待核者', validFrom: '2025-01-01', validTo: '2100-12-31', verifiedOn: '2026-10-12' },
  reforms: [
    { category: 'original-60', baseAgeMonths: 720, startBirthMonth: '1965-01', stepBirthMonths: 4, maxDelayMonths: 36 },
    { category: 'original-55', baseAgeMonths: 660, startBirthMonth: '1970-01', stepBirthMonths: 4, maxDelayMonths: 36 },
    { category: 'original-50', baseAgeMonths: 600, startBirthMonth: '1975-01', stepBirthMonths: 2, maxDelayMonths: 60 },
  ],
  minimumContributionMonthsByYear: Object.fromEntries(Array.from({ length: 15 }, (_, i) => { const year = 2025 + i; return [year, year < 2030 ? 180 : 180 + (year - 2029) * 6]; })),
  finalMinimumYear: 2039, maximumFlexibleMonths: 36,
};
export const LABOR_BENEFIT_PROVINCE_RULE: BenefitProvinceRule = {
  id: 'cn-benefit-province-20261012', qualifyingMonths: 120, minimumTotalMonthsByYear: { 2026: 180 },
  supportedProvinces: ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'],
  sourceIds: ['pension-transfer', 'pension-transfer-2016', 'pension-transfer-current', 'retirement-reform'],
  scope: { region: '中国大陆省级地区（浙江含温州）', population: '已达待遇条件、已核定普通企业职工养老关系与完整经历；无临时账户、视同、跨制度及特殊转移', validFrom: '2026-10-12', validTo: '2026-10-12', verifiedOn: '2026-10-12' },
  branchSourceIds: {
    householdRelationship: ['pension-transfer'], currentTenYears: ['pension-transfer'],
    lastTenYears: ['pension-transfer', 'pension-transfer-2016'], householdFallback: ['pension-transfer', 'pension-transfer-2016'],
    temporaryAccounts: ['pension-transfer', 'pension-transfer-2016'],
  },
};


/** Legal dates stay in LABOR_SOURCES; this scope is the October frozen-model snapshot. */
const shPlannerScope = {
  region: '上海', population: '普通企业职工基本养老同制度；1993年起完整已核实缴历史，无视同/过渡/特殊及一次性补缴；2014年前须明确经办逐月指数和已处理适用历史保底；账户余额截止月已明确；未来为法定范围内整元基数的冻结2026零增长零利息情景，非未来权益承诺；四位取舍未核时计算上下界，不伪称精确',
  validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12',
};
export const LABOR_PENSION_PLANNER_RULES: PensionPlannerRules = {
  retirement: LABOR_RETIREMENT_RULE,
  province: LABOR_BENEFIT_PROVINCE_RULE,
  projection: {
    id: 'sh-pension-planner-frozen-202610', snapshotDate: '2026-10-12', province: '上海',
    pensionBaseCents: 1257700, indexReferenceCents: 1257700,
    futureBaseOptionsCents: [1257700, 2515400, 3773100], futureBaseDomain: 'whole-yuan-range',
    minimumBaseCents: 754600, maximumBaseCents: 3773100,
    employeePersonalRateBps: 800, employeeEmployerRateBps: 1600,
    flexiblePersonalRateBps: 2000, accountCreditRateBps: 800,
    accountDivisors: { ...LABOR_PENSION_RULES[0].accountDivisors },
    earliestHistoryMonth: '1993-01', scope: shPlannerScope,
    employeeRetirementMonthEvidence: { scope: { ...shPlannerScope, population: '上海普通企业职工：法定退休当月仍在职，单位正常缴费；未来仅冻结此口径的明确情景' }, sourceIds: ['sh-retirement-month-payment'] },
    flexibleRetirementMonthEvidence: { scope: { ...shPlannerScope, population: '上海符合参保条件的灵活就业人员：退休前月已达到届时法定缴费年限，选择退休当月继续缴费的冻结情景' }, sourceIds: ['sh-retirement-month-payment'] },
    sourceIds: ['sh-retirement-month-payment', 'sh-pension-2026', 'sh-pension-index-attachment', 'sh-pension-claim-start', 'sh-contribution-base-2026', 'sh-pension-pooling-explanation', 'sh-flexible-pension', 'sh-flexible-population', 'pension-personal-account-credit', 'pension-divisor', 'pension-window', 'retirement-reform', 'retirement-flexible', 'pension-transfer', 'pension-transfer-2016', 'pension-transfer-current'],
    contributionEvidence: { scope: shPlannerScope, sourceIds: ['sh-contribution-base-2026', 'sh-pension-pooling-explanation', 'sh-flexible-pension', 'sh-flexible-population'] },
    indexEvidence: { scope: shPlannerScope, sourceIds: ['sh-pension-index-attachment', 'sh-contribution-base-2026'] },
    formulaEvidence: { scope: shPlannerScope, sourceIds: ['sh-pension-2026', 'sh-pension-index-attachment', 'sh-contribution-base-2026', 'pension-divisor'] },
    accountEvidence: { scope: shPlannerScope, sourceIds: ['pension-personal-account-credit', 'sh-pension-2026'] },
    payoutEvidence: { scope: shPlannerScope, sourceIds: ['sh-pension-claim-start', 'sh-pension-2026', 'pension-window'] },
  },
};

export const LABOR_HOUSING_FUND_RULES: HousingFundRule[] = [
  {
    "id": "bj-housing-employee-2026",
    "regime": "employee",
    "minimumBaseCents": 254000,
    "maximumBaseCents": 3634800,
    "baseStepCents": 100,
    "minimumRateBps": 500,
    "maximumRateBps": 1200,
    "rateStepBps": 100,
    "precisionNote": "本版仅接受经办已核定整数元基数；不自行从工资推算或取整。北京普通企业比例按官方规则为整数百分比，双方相同。",
    "calculation": "employee-equal-share",
    "sourceIds": [
      "bj-housing-2026",
      "bj-housing-general",
      "bj-housing-calculation",
      "bj-housing-cap-table"
    ],
    "scope": {
      "region": "北京",
      "population": "普通企业正常职工；非中直/国管/铁路分中心，无基本生活费、低薪个人减免、降缓缴及补退调整",
      "validFrom": "2026-07-01",
      "validTo": "2027-06-30",
      "verifiedOn": "2026-10-12"
    }
  },
  {
    "id": "wz-housing-a-employee-2026",
    "regime": "employee",
    "minimumBaseCents": 266000,
    "maximumBaseCents": 3296400,
    "baseStepCents": 100,
    "minimumRateBps": 500,
    "maximumRateBps": 1200,
    "rateStepBps": 1,
    "precisionNote": "产品精度子集：已核定整数元基数、最多两位小数百分比；不代表法规禁止其他精度。按原文逐方整元四舍五入；灵活按总率先除2舍入再乘2。",
    "calculation": "employee-equal-share",
    "sourceIds": [
      "wz-housing-2026"
    ],
    "scope": {
      "region": "温州 · 鹿城、龙湾、瓯海、洞头、温州海洋经济发展示范区",
      "population": "普通企业正常职工；按单位所在县区，经办已核定基数和双方相同比例；不含机关事业、社会团体、减免降缓及补退调整",
      "validFrom": "2026-07-01",
      "validTo": "2027-06-30",
      "verifiedOn": "2026-10-12"
    }
  },
  {
    "id": "wz-housing-a-flexible-2026",
    "regime": "flexible",
    "minimumBaseCents": 266000,
    "maximumBaseCents": 3296400,
    "baseStepCents": 100,
    "minimumRateBps": 1000,
    "maximumRateBps": 2400,
    "rateStepBps": 1,
    "precisionNote": "产品精度子集：已核定整数元基数、最多两位小数百分比；不代表法规禁止其他精度。按原文逐方整元四舍五入；灵活按总率先除2舍入再乘2。",
    "calculation": "flexible-half-rounded",
    "sourceIds": [
      "wz-housing-2026"
    ],
    "scope": {
      "region": "温州 · 鹿城、龙湾、瓯海、洞头、温州海洋经济发展示范区",
      "population": "已登记灵活缴存人且无未结清公积金贷款；缴存机构已核定适用县区档；不含机关事业、社会团体、减免降缓及补退调整",
      "validFrom": "2026-07-01",
      "validTo": "2027-06-30",
      "verifiedOn": "2026-10-12"
    }
  },
  {
    "id": "wz-housing-b-employee-2026",
    "regime": "employee",
    "minimumBaseCents": 243000,
    "maximumBaseCents": 3296400,
    "baseStepCents": 100,
    "minimumRateBps": 500,
    "maximumRateBps": 1200,
    "rateStepBps": 1,
    "precisionNote": "产品精度子集：已核定整数元基数、最多两位小数百分比；不代表法规禁止其他精度。按原文逐方整元四舍五入；灵活按总率先除2舍入再乘2。",
    "calculation": "employee-equal-share",
    "sourceIds": [
      "wz-housing-2026"
    ],
    "scope": {
      "region": "温州 · 乐清、瑞安",
      "population": "普通企业正常职工；按单位所在县区，经办已核定基数和双方相同比例；不含机关事业、社会团体、减免降缓及补退调整",
      "validFrom": "2026-07-01",
      "validTo": "2027-06-30",
      "verifiedOn": "2026-10-12"
    }
  },
  {
    "id": "wz-housing-b-flexible-2026",
    "regime": "flexible",
    "minimumBaseCents": 243000,
    "maximumBaseCents": 3296400,
    "baseStepCents": 100,
    "minimumRateBps": 1000,
    "maximumRateBps": 2400,
    "rateStepBps": 1,
    "precisionNote": "产品精度子集：已核定整数元基数、最多两位小数百分比；不代表法规禁止其他精度。按原文逐方整元四舍五入；灵活按总率先除2舍入再乘2。",
    "calculation": "flexible-half-rounded",
    "sourceIds": [
      "wz-housing-2026"
    ],
    "scope": {
      "region": "温州 · 乐清、瑞安",
      "population": "已登记灵活缴存人且无未结清公积金贷款；缴存机构已核定适用县区档；不含机关事业、社会团体、减免降缓及补退调整",
      "validFrom": "2026-07-01",
      "validTo": "2027-06-30",
      "verifiedOn": "2026-10-12"
    }
  },
  {
    "id": "wz-housing-c-employee-2026",
    "regime": "employee",
    "minimumBaseCents": 218000,
    "maximumBaseCents": 3296400,
    "baseStepCents": 100,
    "minimumRateBps": 500,
    "maximumRateBps": 1200,
    "rateStepBps": 1,
    "precisionNote": "产品精度子集：已核定整数元基数、最多两位小数百分比；不代表法规禁止其他精度。按原文逐方整元四舍五入；灵活按总率先除2舍入再乘2。",
    "calculation": "employee-equal-share",
    "sourceIds": [
      "wz-housing-2026"
    ],
    "scope": {
      "region": "温州 · 永嘉、文成、平阳、泰顺、苍南、龙港",
      "population": "普通企业正常职工；按单位所在县区，经办已核定基数和双方相同比例；不含机关事业、社会团体、减免降缓及补退调整",
      "validFrom": "2026-07-01",
      "validTo": "2027-06-30",
      "verifiedOn": "2026-10-12"
    }
  },
  {
    "id": "wz-housing-c-flexible-2026",
    "regime": "flexible",
    "minimumBaseCents": 218000,
    "maximumBaseCents": 3296400,
    "baseStepCents": 100,
    "minimumRateBps": 1000,
    "maximumRateBps": 2400,
    "rateStepBps": 1,
    "precisionNote": "产品精度子集：已核定整数元基数、最多两位小数百分比；不代表法规禁止其他精度。按原文逐方整元四舍五入；灵活按总率先除2舍入再乘2。",
    "calculation": "flexible-half-rounded",
    "sourceIds": [
      "wz-housing-2026"
    ],
    "scope": {
      "region": "温州 · 永嘉、文成、平阳、泰顺、苍南、龙港",
      "population": "已登记灵活缴存人且无未结清公积金贷款；缴存机构已核定适用县区档；不含机关事业、社会团体、减免降缓及补退调整",
      "validFrom": "2026-07-01",
      "validTo": "2027-06-30",
      "verifiedOn": "2026-10-12"
    }
  }
];
const shAutoRule: AutoContributionRule = {
  "id": "sh-ordinary-personal-auto-202610",
  "city": "shanghai",
  "scope": {
    "region": "上海",
    "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长",
    "validFrom": "2026-10-01",
    "validTo": "2026-10-31",
    "verifiedOn": "2026-10-12"
  },
  "sourceIds": [
    "sh-pension-pooling-explanation",
    "sh-unemployment-personal-base-2013",
    "sh-unemployment-personal-continuity-2016",
    "sh-unemployment-temporary-employer-2017",
    "sh-housing-2026",
    "sh-housing-base-tax-cap-2026",
    "sh-long-term-care-2026",
    "sh-medical-2026",
    "sh-contribution-base-2026",
    "sh-employee-declaration-2026",
    "social-insurance-law",
    "iit-contribution-deduction",
    "iit-law",
    "iit-table",
    "sh-medical-public-fund-definition"
  ],
  "personalZeroBurdenSourceIds": [
    "social-insurance-law",
    "sh-medical-2026",
    "sh-long-term-care-2026"
  ],
  "items": [
    {
      "id": "pension",
      "payer": "personal",
      "label": "基本养老保险",
      "base": {
        "minimumCents": 754600,
        "maximumCents": 3773100,
        "stepCents": 100,
        "mapping": "prior-average-wage",
        "mappingSourceIds": [
          "sh-pension-pooling-explanation",
          "sh-employee-declaration-2026"
        ]
      },
      "rateBps": 800,
      "fixedCents": 0,
      "rounding": "exact-cent",
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      },
      "sourceIds": [
        "sh-pension-pooling-explanation",
        "sh-contribution-base-2026"
      ]
    },
    {
      "id": "medical",
      "payer": "personal",
      "label": "基本医疗保险（生育无单独个人缴费）",
      "base": {
        "minimumCents": 754600,
        "maximumCents": 3773100,
        "stepCents": 100,
        "mapping": "prior-average-wage",
        "mappingSourceIds": [
          "sh-pension-pooling-explanation",
          "sh-employee-declaration-2026"
        ]
      },
      "rateBps": 200,
      "fixedCents": 0,
      "rounding": "exact-cent",
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      },
      "sourceIds": [
        "sh-medical-2026",
        "sh-contribution-base-2026"
      ]
    },
    {
      "id": "unemployment",
      "payer": "personal",
      "label": "失业保险（个人基础比例）",
      "base": {
        "minimumCents": 754600,
        "maximumCents": 3773100,
        "stepCents": 100,
        "mapping": "prior-average-wage",
        "mappingSourceIds": [
          "sh-pension-pooling-explanation",
          "sh-employee-declaration-2026"
        ]
      },
      "rateBps": 50,
      "fixedCents": 0,
      "rounding": "exact-cent",
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      },
      "sourceIds": [
        "sh-unemployment-personal-base-2013",
        "sh-unemployment-personal-continuity-2016",
        "sh-unemployment-temporary-employer-2017",
        "sh-pension-pooling-explanation",
        "sh-contribution-base-2026"
      ]
    },
    {
      "id": "housing",
      "payer": "personal",
      "label": "住房公积金（普通无补充方案）",
      "base": {
        "minimumCents": 274000,
        "maximumCents": 3773100,
        "stepCents": 100,
        "mapping": "prior-average-wage",
        "mappingSourceIds": [
          "sh-housing-2026",
          "sh-housing-base-tax-cap-2026"
        ]
      },
      "rateBps": 500,
      "fixedCents": 0,
      "rounding": "exact-yuan",
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      },
      "sourceIds": [
        "sh-housing-2026",
        "sh-housing-base-tax-cap-2026"
      ],
      "rateRange": {
        "minimumBps": 500,
        "maximumBps": 700,
        "stepBps": 100
      }
    },
    {
      "id": "pension",
      "payer": "employer",
      "label": "基本养老保险",
      "base": {
        "minimumCents": 754600,
        "maximumCents": 3773100,
        "stepCents": 100,
        "mapping": "prior-average-wage",
        "mappingSourceIds": [
          "sh-pension-pooling-explanation",
          "sh-employee-declaration-2026"
        ]
      },
      "rateBps": 1600,
      "fixedCents": 0,
      "rounding": "exact-cent",
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      },
      "sourceIds": [
        "sh-pension-pooling-explanation",
        "sh-contribution-base-2026"
      ]
    },
    {
      "id": "medical",
      "payer": "employer",
      "label": "医疗保险（含生育及地方附加，单位总费率）",
      "base": {
        "minimumCents": 754600,
        "maximumCents": 3773100,
        "stepCents": 100,
        "mapping": "prior-average-wage",
        "mappingSourceIds": [
          "sh-pension-pooling-explanation",
          "sh-employee-declaration-2026"
        ]
      },
      "rateBps": 900,
      "fixedCents": 0,
      "rounding": "exact-cent",
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      },
      "sourceIds": [
        "sh-medical-2026",
        "sh-contribution-base-2026"
      ]
    },
    {
      "id": "housing",
      "payer": "employer",
      "label": "住房公积金（普通无补充方案）",
      "base": {
        "minimumCents": 274000,
        "maximumCents": 3773100,
        "stepCents": 100,
        "mapping": "prior-average-wage",
        "mappingSourceIds": [
          "sh-housing-2026",
          "sh-housing-base-tax-cap-2026"
        ]
      },
      "rateBps": 500,
      "fixedCents": 0,
      "rounding": "exact-yuan",
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      },
      "sourceIds": [
        "sh-housing-2026",
        "sh-housing-base-tax-cap-2026"
      ],
      "rateRange": {
        "minimumBps": 500,
        "maximumBps": 700,
        "stepBps": 100
      }
    }
  ]
};
export const LABOR_AUTO_CONTRIBUTION_RULES: AutoContributionRule[] = [
  ...bjAutoRules,
  shAutoRule,
  ...LABOR_HOUSING_FUND_RULES.filter((rule) => rule.id.startsWith('wz-') && rule.regime === 'employee').map((housing): AutoContributionRule => {
    const scope = { ...housing.scope, population: `${housing.scope.population}；普通持续在职，非新入职等特殊工资口径；只核个人养老和公积金，其他项尚缺`, validFrom: '2026-10-01', validTo: '2026-10-31' };
    return {
      id: `auto-${housing.id}`, city: 'wenzhou', area: housing.id, scope,
      sourceIds: [...housing.sourceIds, 'zj-employee-base-mapping', 'zj-contribution-base-2026', 'zj-contribution-explanation-2026', 'social-insurance-law'],
      personalZeroBurdenSourceIds: ['social-insurance-law'],
      items: [
        { id: 'pension', payer: 'personal', label: '基本养老保险',
          base: { minimumCents: 512200, maximumCents: 2561100, stepCents: 100, mapping: 'prior-average-wage', mappingSourceIds: ['zj-employee-base-mapping'] },
          rateBps: 800, fixedCents: 0, rounding: 'exact-cent', scope,
          sourceIds: ['zj-contribution-base-2026', 'zj-contribution-explanation-2026'],
        },
        ...(['personal', 'employer'] as const).map((payer): AutoContributionItemRule => ({
          id: 'housing', payer, label: '住房公积金', scope, sourceIds: housing.sourceIds,
          base: { minimumCents: housing.minimumBaseCents, maximumCents: housing.maximumBaseCents, stepCents: housing.baseStepCents, mapping: 'prior-average-wage', mappingSourceIds: housing.sourceIds },
          rateBps: housing.minimumRateBps, fixedCents: 0, rounding: 'half-up-yuan',
          rateRange: { minimumBps: housing.minimumRateBps, maximumBps: housing.maximumRateBps, stepBps: housing.rateStepBps },
        })),
      ],
    };
  }),
];

/** Shanghai personal tax comparison; employer unemployment amount stays unknown. */
export const LABOR_FROZEN_SALARY_RULES: FrozenSalaryComparisonRule[] = [{
  tax: LABOR_TAX_RULE,
  "id": "sh-frozen-salary-202610",
  "city": "shanghai",
  "contributionRuleIds": [
    "sh-ordinary-personal-auto-202610"
  ],
  "sourceIds": [
    "sh-pension-pooling-explanation",
    "sh-unemployment-personal-base-2013",
    "sh-unemployment-personal-continuity-2016",
    "sh-unemployment-temporary-employer-2017",
    "sh-housing-2026",
    "sh-housing-base-tax-cap-2026",
    "sh-long-term-care-2026",
    "sh-medical-2026",
    "sh-contribution-base-2026",
    "sh-employee-declaration-2026",
    "social-insurance-law",
    "iit-contribution-deduction",
    "iit-law",
    "iit-table",
    "sh-medical-public-fund-definition",
    "iit-withholding"
  ],
  "scope": {
    "region": "上海",
    "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长；居民普通现金工资，单位按法定规定缴费；固定2026-10规则重复12期；当期工资支持分、上年月均支持整元及法定上下限映射，住房5/6/7%；不判定最低工资合规，工资不足个人实缴时不输出负到账",
    "validFrom": "2026-10-01",
    "validTo": "2026-10-31",
    "verifiedOn": "2026-10-12"
  },
  "inputDomain": {
    "gross": {
      "minimumCents": 0,
      "maximumCents": 8333333333,
      "stepCents": 1
    },
    "priorAverageWage": {
      "minimumCents": 0,
      "maximumCents": 100000000000,
      "stepCents": 100
    },
    "housingRateBps": [
      500,
      600,
      700
    ],
    "note": "当前工资可到分，上年月均暂支持整元；比例5/6/7%。金额上限仅为12期整数分计算安全界限，不是政策工资上限；实际基数仍按法定上下限映射。分项尾差规则未核时精确提示缺项，不自动取整。"
  },
  "deductions": [
    {
      "itemId": "pension",
      "mode": "full-paid",
      "sourceIds": [
        "sh-pension-pooling-explanation",
        "sh-contribution-base-2026",
        "iit-contribution-deduction"
      ],
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长；居民普通现金工资，单位按法定规定缴费；固定2026-10规则重复12期；当期工资支持分、上年月均支持整元及法定上下限映射，住房5/6/7%；不判定最低工资合规，工资不足个人实缴时不输出负到账",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      }
    },
    {
      "itemId": "medical",
      "mode": "full-paid",
      "sourceIds": [
        "sh-medical-2026",
        "sh-contribution-base-2026",
        "iit-contribution-deduction"
      ],
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长；居民普通现金工资，单位按法定规定缴费；固定2026-10规则重复12期；当期工资支持分、上年月均支持整元及法定上下限映射，住房5/6/7%；不判定最低工资合规，工资不足个人实缴时不输出负到账",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      }
    },
    {
      "itemId": "unemployment",
      "mode": "full-paid",
      "sourceIds": [
        "sh-unemployment-personal-base-2013",
        "sh-unemployment-personal-continuity-2016",
        "sh-unemployment-temporary-employer-2017",
        "sh-pension-pooling-explanation",
        "sh-contribution-base-2026",
        "iit-contribution-deduction"
      ],
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长；居民普通现金工资，单位按法定规定缴费；固定2026-10规则重复12期；当期工资支持分、上年月均支持整元及法定上下限映射，住房5/6/7%；不判定最低工资合规，工资不足个人实缴时不输出负到账",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      }
    }
  ],
  "ordinaryEmployerSocialExemption": {
    "scope": {
      "region": "上海",
      "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长；居民普通现金工资，单位按法定规定缴费；固定2026-10规则重复12期；当期工资支持分、上年月均支持整元及法定上下限映射，住房5/6/7%；不判定最低工资合规，工资不足个人实缴时不输出负到账",
      "validFrom": "2026-10-01",
      "validTo": "2026-10-31",
      "verifiedOn": "2026-10-12"
    },
    "sourceIds": [
      "iit-contribution-deduction",
      "social-insurance-law",
      "sh-pension-pooling-explanation",
      "sh-medical-2026",
      "sh-medical-public-fund-definition"
    ]
  },
  "employerStatutoryExemptionWithoutAmount": {
    "unemployment": {
      "scope": {
        "region": "上海",
        "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长；居民普通现金工资，单位按法定规定缴费；固定2026-10规则重复12期；当期工资支持分、上年月均支持整元及法定上下限映射，住房5/6/7%；不判定最低工资合规，工资不足个人实缴时不输出负到账",
        "validFrom": "2026-10-01",
        "validTo": "2026-10-31",
        "verifiedOn": "2026-10-12"
      },
      "sourceIds": [
        "iit-contribution-deduction",
        "social-insurance-law"
      ]
    }
  },
  "housingTax": {
    "maximumBaseCents": 3773100,
    "maximumRateBps": 1200,
    "scope": {
      "region": "上海",
      "population": "普通企业持续整月正常在职；非新入职/调入、机关事业及特殊人员；无补充公积金、降缓缴、减免、补退补缴；上年月均及映射基数暂支持整元；逐项乘积须满足已核精度，公积金尾差舍入未核时只拒受影响项目；非法律限制工资步长；居民普通现金工资，单位按法定规定缴费；固定2026-10规则重复12期；当期工资支持分、上年月均支持整元及法定上下限映射，住房5/6/7%；不判定最低工资合规，工资不足个人实缴时不输出负到账",
      "validFrom": "2026-10-01",
      "validTo": "2026-10-31",
      "verifiedOn": "2026-10-12"
    },
    "sourceIds": [
      "iit-contribution-deduction",
      "sh-housing-base-tax-cap-2026",
      "sh-housing-2026"
    ]
  }
}];

export const LABOR_FLEXIBLE_CONTRIBUTION_RULES: FlexibleContributionRule[] = [
  {
    "id": "bj-personal-three-insurance-202610",
    "supportedChannels": [
      "市/区人力资源公共服务中心等社会保险代理机构个人委托存档",
      "街道（乡镇）便民服务中心规定个人参保"
    ],
    "minimumBaseYuan": 7270,
    "maximumBaseYuan": 36348,
    "pensionRateBps": 2000,
    "unemploymentRateBps": 100,
    "medicalFixedCents": 59368,
    "itemSourceIds": {
      "pension": [
        "bj-contribution-2026",
        "bj-contribution-rates-2026",
        "bj-personal-shared-base"
      ],
      "unemployment": [
        "bj-contribution-2026",
        "bj-contribution-rates-2026",
        "bj-personal-shared-base"
      ],
      "medical": [
        "bj-contribution-2026"
      ]
    },
    "sourceIds": [
      "bj-contribution-2026",
      "bj-contribution-rates-2026",
      "bj-personal-shared-base"
    ],
    "scope": {
      "region": "北京",
      "population": "通知规定代理机构个人存档或街道乡镇便民服务中心个人参保；身份与各险种组合已由经办核定，无补贴减免或补退调整",
      "validFrom": "2026-10-01",
      "validTo": "2026-10-31",
      "verifiedOn": "2026-10-12"
    }
  }
];

export const LABOR_PENSION_COMPONENT_RULES: PensionComponentRule[] = [
  {
    "id": "beijing-pension-component-review-2026",
    "region": "beijing",
    "basicReviewEvidence": {
      "scope": { "region": "北京", "population": "普通企业职工：经办已确认标准基础分项B×全部核定年限×1%适用及B/N（含已认定视同年限、普通中人）；不自行认定年限或资格，不算过渡、特殊公式或完整待遇", "validFrom": "2026-01-01", "validTo": "2026-12-31", "verifiedOn": "2026-10-12" },
      "sourceIds": ["bj-pension-formula", "bj-pension-formula-attachment"]
    },
    "supportedYear": 2026,
    "basicRateBps": 100,
    "accountDivisors": {
      "50": 195,
      "51": 190,
      "52": 185,
      "53": 180,
      "54": 175,
      "55": 170,
      "56": 164,
      "57": 158,
      "58": 152,
      "59": 145,
      "60": 139,
      "61": 132,
      "62": 125,
      "63": 117,
      "64": 109,
      "65": 101,
      "66": 93
    },
    "componentSourceIds": {
      "basic": [
        "bj-pension-formula",
        "bj-pension-formula-attachment"
      ],
      "account": [
        "bj-pension-formula",
        "bj-pension-formula-attachment",
        "pension-divisor"
      ]
    },
    "precisionNote": "基础输入为经办已处理的基础养老金计发工资平均值B，不是当期省平均工资C；核定两位年限和结果恰到角是产品支持子集，尤其不宣称浙江法定年限应取两位。",
    "sourceIds": [
      "bj-pension-formula",
      "bj-pension-formula-attachment",
      "pension-divisor"
    ],
    "scope": {
      "region": "北京",
      "population": "北京1998-07-01以后参加工作、经办已确认普通新人分项公式及2026参数；无视同、过渡性、双低、军转、机关事业转换及其他特殊身份；只复核单一分项，不核定总待遇",
      "validFrom": "2026-01-01",
      "validTo": "2026-12-31",
      "verifiedOn": "2026-10-12"
    }
  },
  {
    "id": "zhejiang-pension-component-review-2026",
    "region": "zhejiang",
    "basicReviewEvidence": {
      "scope": { "region": "浙江（含温州）", "population": "普通企业职工：2026经办已核定第14/15条标准基础分项B×全部核定年限×1%及B/N，可含已认定视同年限或普通中人；排除双低系数、老退休旧法、转制等特殊公式；不计算过渡、补贴、调节金或完整待遇", "validFrom": "2026-01-01", "validTo": "2026-12-31", "verifiedOn": "2026-10-12" },
      "sourceIds": ["zj-pension-formula", "zj-pension-provincial"]
    },
    "supportedYear": 2026,
    "basicRateBps": 100,
    "accountDivisors": {
      "50": 195,
      "51": 190,
      "52": 185,
      "53": 180,
      "54": 175,
      "55": 170,
      "56": 164,
      "57": 158,
      "58": 152,
      "59": 145,
      "60": 139,
      "61": 132,
      "62": 125,
      "63": 117,
      "64": 109,
      "65": 101,
      "66": 93
    },
    "componentSourceIds": {
      "basic": [
        "zj-pension-formula",
        "zj-pension-new-entrant",
        "zj-pension-provincial"
      ],
      "account": [
        "zj-pension-formula",
        "zj-pension-new-entrant",
        "zj-pension-provincial",
        "pension-divisor"
      ]
    },
    "precisionNote": "基础输入为经办已处理的基础养老金计发工资平均值B，不是当期省平均工资C；核定两位年限和结果恰到角是产品支持子集，尤其不宣称浙江法定年限应取两位。",
    "sourceIds": [
      "zj-pension-formula",
      "zj-pension-new-entrant",
      "zj-pension-provincial",
      "pension-divisor"
    ],
    "scope": {
      "region": "浙江（含温州）",
      "population": "浙江1998-01-01以后首次参保、经办已确认普通新人分项公式及2026参数；无视同、过渡性、双低、军转、机关事业转换及其他特殊身份；只复核单一分项，不核定总待遇",
      "validFrom": "2026-01-01",
      "validTo": "2026-12-31",
      "verifiedOn": "2026-10-12"
    }
  }
];

/** Field-level provenance, displayed beside the public rule registry. */
export const LABOR_RULE_FIELDS: Array<{ field: string; value: string; scope: string; sourceIds: string[] }> = [
  { field: '上海未来养老固定参数方案', value: '2026月均12577元；未来基数7546—37731元整元；职工个人8%单位16%、灵活个人20%、账户入账8%', scope: '1993年起已核历史指数和与账户截止月；2014年前另核历史保底；任意累计月数，四位取舍双界进角一致才给确定金额；冻结2026零增长零利息，假设退休月办妥申领、次月开始累计窗口', sourceIds: LABOR_PENSION_PLANNER_RULES.projection!.sourceIds },
  { field: '上海普通职工个人自动缴费', value: '养老8%、医保2%、失业基础0.5%；公积金双方同率5/6/7%；长护从医保池调剂不额外扣费', scope: '2026-10；持续正常在职、无补充或降缓缴；上年月均及映射基数暂为整元，住房乘积须恰为整元；失业分下尾差拒算，不是法定工资精度', sourceIds: shAutoRule.sourceIds },
  { field: '上海固定规则12期个人税后比较', value: '当前工资分精度，上年月均整元；住房税基上限37731元、比例12%，用有理数比较税限；个人D与可扣L分别计算', scope: '仅2026-10规则冻结12期；域外拒税情景，不将产品范围用作基数上下限；单位失业普通法定缴费免税资格不代替其未知金额', sourceIds: LABOR_FROZEN_SALARY_RULES[0].sourceIds },
  ...LABOR_HOUSING_FUND_RULES.map((r) => ({ field: `${r.scope.region} · ${r.regime === 'employee' ? '职工公积金' : '灵活公积金'}`, value: `基数${r.minimumBaseCents / 100}—${r.maximumBaseCents / 100}元；${r.regime === 'employee' ? '每方' : '个人总'}比例${r.minimumRateBps / 100}%—${r.maximumRateBps / 100}%；${r.calculation === 'employee-equal-share' ? '每方分别整元四舍五入再相加' : '总率先除2、整元四舍五入、再乘2'}`, scope: `${r.scope.validFrom}—${r.scope.validTo}；${r.scope.population}；${r.precisionNote}`, sourceIds: r.sourceIds })),
  { field: '北京限定个人三险', value: '养老20%、失业1%，共用核定7270—36348元整数基数；医保593.68元/月', scope: '仅2026-10、通知渠道及实际经办核定组合；不是任意选择退出参保义务', sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026', 'bj-personal-shared-base'] },
  ...LABOR_PENSION_COMPONENT_RULES.flatMap((r) => [
    { field: `${r.scope.region} · 核定标准基础分项`, value: '经办核定平均值B × 全部核定年限 × 1%；专门确认后可含已认定视同及普通中人，不限15—28年，只输出恰到角的一项。', scope: `2026；${(r.basicReviewEvidence ?? r).scope.population}；${r.precisionNote}`, sourceIds: r.basicReviewEvidence?.sourceIds ?? r.componentSourceIds.basic },
    { field: `${r.scope.region} · 核定账户分项`, value: '核定储存额 ÷ 核定整岁计发月数；仍为原新人子域，只输出恰到角的一项，无合计。', scope: `2026；${r.scope.population}`, sourceIds: r.componentSourceIds.account },
  ]),
  { field: '跨省待遇领取地顺序', value: '关系在户籍省 → 现关系省满120月 → 最近满120月原参保省 → 户籍省归集', scope: '2026-10-12快照；先符合总年限及年龄等条件；仅普通关系省级判断，浙江各市按同省归集', sourceIds: ['pension-transfer', 'pension-transfer-2016', 'pension-transfer-current'] },
  ...LABOR_PENSION_CONTRIBUTION_ITEMS.map((r) => ({ field: `${r.scope.region} · ${r.regime === 'employee' ? '职工' : '灵活就业'}养老缴费单项`, value: `已核定整数元基数${r.minimumBaseYuan}—${r.maximumBaseYuan}；个人${r.personalRatePercent}%${r.regime === 'employee' ? `、单位${r.employerRatePercent}%` : ''}`, scope: `仅2026-10；${r.scope.population}；不代表完整五险一金`, sourceIds: r.sourceIds })),
  { field: '普通工资基本减除费用', value: '5000元 × 本单位当年任职受雇月数', scope: '普通居民工资累计预扣；特殊口径未开放', sourceIds: ['iit-withholding'] },
  { field: '年度基本减除费用', value: '60000元/年', scope: '居民综合所得年度口径，不按雇主重复扣除', sourceIds: ['iit-law'] },
  ...LABOR_TAX_RULE.brackets.map((b, i) => ({ field: `综合所得税表第${i + 1}档`, value: `${b.upToCents === null ? '超过960000元' : `累计税基至${b.upToCents / 100}元`}；税率${b.rateBps / 100}%；速算扣除${b.quickDeductionCents / 100}元`, scope: '2026税规则快照，税基不是税前工资', sourceIds: ['iit-law', 'iit-table'] })),
  { field: '原60/55类延退', value: '1965-01/1970-01起，每4个出生月延迟1月，至多36月', scope: '身份类别须先确认；以官方对照表为准', sourceIds: ['retirement-reform'] },
  { field: '原50类延退', value: '1975-01起，每2个出生月延迟1月，至多60月', scope: '不以性别或灵活就业身份自行归类', sourceIds: ['retirement-reform'] },
  { field: '最低缴费年限', value: '2025—2029为180月；2030起每年+6月；2039起240月', scope: '提前按选择年份，延迟按法定年龄对应年份', sourceIds: ['retirement-reform', 'retirement-flexible'] },
  { field: '上海基础养老金比例', value: '计发基数 × (1+核定平均指数)÷2 × 缴费年数 × 1%', scope: '沪2026年16号；首版只开放2026退休、无视同/过渡性待遇参数情景', sourceIds: ['sh-pension-2026'] },
  { field: '上海缴费年数精度/金额舍入', value: '剩余月数折年保留4位；养老金各分项分别见分进角', scope: '不用于推定上海社保缴费金额舍入', sourceIds: ['sh-pension-2026'] },
  { field: '个人账户计发月数', value: Object.entries(LABOR_PENSION_RULES[0].accountDivisors).map(([age, divisor]) => `${age}岁:${divisor}`).join('；'), scope: '首版只开放50—66整周岁表；非整岁无可靠折算依据禁用', sourceIds: ['pension-divisor'] },
  { field: '个人/单位实际缴费', value: '由用户按经办缴费记录分别填入；不自动推出合法可扣额', scope: '工资支持2026-10—12实缴模式；不代表已支持任何地区完整费率包', sourceIds: ['social-insurance-law', 'housing-fund-2026', 'iit-law'] },
];
export const LABOR_COVERAGE: Array<{ id: string; region: string; period: string; population: string; status: 'supported' | 'partial' | 'blocked'; reason: string; sourceIds: string[] }> = [
  { id: 'sh-pension-planner', region: '上海（金额投影）及全国普通退休/领取省条件核对', period: '2026-10-12政策快照，未来仅固定参数模型', population: shPlannerScope.population, status: 'partial', reason: '历史已核月指数和、账户余额截止月与月份固定；未来法定范围内整元基数或明确停缴。任意总月数采用四位取舍上下界；分项进角一致才出单一金额，否则给诊断范围。整周岁除数限制仍在，不重建历史、不预测政策利息；资料不足或门槛敏感不冒充无解。', sourceIds: LABOR_PENSION_PLANNER_RULES.projection!.sourceIds },
  { id: 'housing-items', region: '北京、温州各县区', period: '2026-07至2027-06', population: '普通企业正常职工；温州另含无未结清公积金贷款的限定灵活缴存人', status: 'partial', reason: '已核定基数及比例的公积金单项，逐方整元舍入；温州按县区三档。不核算特殊减免、机关事业、贷款历史约束或补退差额。', sourceIds: ['bj-housing-2026', 'bj-housing-calculation', 'wz-housing-2026'] },
  { id: 'bj-personal-three', region: '北京', period: '2026-10', population: '通知限定渠道个人参保，实际参保组合已核定', status: 'partial', reason: '养老、失业共用核定基数；医保固定额；只计已参加项目及现金支出小计，不核定参保资格、补贴后净自付或待遇。', sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026', 'bj-personal-shared-base'] },
  { id: 'pension-component-review', region: '北京、浙江（含温州）', period: '2026', population: '基础分项为经办已核标准公式的普通企业职工，可含已认定视同及中人；账户仍限普通新人', status: 'partial', reason: '明确确认标准基础分项B×全部年限×1%后，不再限15—28年，核定N暂支持两位小数；只复核精确到角的一个分项，不认定年限或资格。双低系数等特殊公式拒算；不重建指数、不输出总额、逆算或累计。', sourceIds: ['bj-pension-formula', 'bj-pension-formula-attachment', 'zj-pension-formula', 'zj-pension-new-entrant', 'zj-pension-provincial', 'pension-divisor'] },
  { id: 'cn-tax', region: '中国大陆', period: '2026', population: '居民个人普通综合所得', status: 'supported', reason: '支持已核实收入额、专项扣除和附加扣除下的年度应纳税额及已缴差额；不自动判断汇算申报义务或减免。', sourceIds: ['iit-law', 'iit-withholding', 'iit-table'] },
  { id: 'cn-retirement', region: '中国大陆', period: '2025起（2026-10-12政策快照）', population: '原50/55/60类别已确认的普通企业职工', status: 'partial', reason: '按出生年月算退休日期和最低年限；不替代身份、程序、领取地或完整待遇资格核定。', sourceIds: ['retirement-reform', 'retirement-flexible'] },
  { id: 'verified-payroll', region: '中国大陆（实缴金额模式）', period: '2026-10至2026-12', population: '居民普通工资；缴费与可扣金额已核实', status: 'partial', reason: '计算实发、单位已填成本及固定实缴下的税前反推；不自动核定五险一金基数、比例或金额。', sourceIds: ['social-insurance-law', 'housing-fund-2026', 'iit-withholding'] },
  { id: 'sh-pension', region: '上海', period: '2026-08-16至年底退休情景（办法本身有效至2031-08-15）', population: '无视同/过渡性待遇，整周岁表内年龄且关键参数已核定', status: 'partial', reason: '固定规则金额情景、账户余额单变量目标逆算及领取窗口累计。历史指数不自动推导，不预测未来工资、利息、政策。', sourceIds: ['sh-pension-2026', 'pension-divisor', 'pension-window'] },
  { id: 'sh-payroll', region: '上海', period: '2026-10', population: '普通企业持续正常在职、无补充及降缓缴；居民普通工资固定规则12期比较', status: 'partial', reason: '个人养老8%、医保2%、失业基础0.5%、公积金双方5/6/7%；当期工资支持分、上年月均暂支持整元，不再限定8000—15000或整百。公积金及其他分项若出现未核尾差则明确缺项；完整个人缴费与扣除依据齐全且工资够缴时输出固定12期净额。单位失业当期费率及工伤未补齐，完整单位成本仍禁用。', sourceIds: shAutoRule.sourceIds },
  { id: 'sz-payroll', region: '深圳', period: '2026-10', population: '企业职工 / 灵活就业', status: 'blocked', reason: '户籍、医保档次、公积金个人免缴及不等比例、工伤浮动和新入职下限不能统一套算；完整依据尚未齐备。', sourceIds: [] },
  { id: 'bj-payroll', region: '北京', period: '2026-10', population: '普通企业持续正常在职的已核精确子域', status: 'partial', reason: '个人已核项目完整时显示缴费合计；单位另需确认本期最终工伤费率且各项无未知尾差，才显示完整五险一金及标准成本。特殊缴存不覆盖；一般税后仍缺大额互助税扣口径，只开放严格零税上界证明。', sourceIds: bjAutoRules[0].sourceIds },
  { id: 'bj-pension', region: '北京', period: '2026', population: '企业职工养老金', status: 'blocked', reason: '总额规则未启用：2026当期计发参数、最低待遇及完整舍入链尚未闭合；另有核定中间参数单一算式复核，不据此输出总额。不能套上海公式。', sourceIds: ['pension-divisor'] },
  { id: 'zj-pension', region: '浙江（含温州）', period: '2026', population: '企业职工养老金', status: 'blocked', reason: '省统一规则直接覆盖温州，8537元计发参数已核；仍缺2026调节金参数、当前最低待遇补足与完整舍入链，不能把基础与个人账户两项之和称作浙江养老金总额。', sourceIds: ['zj-contribution-base-2026', 'zj-contribution-explanation-2026', 'zj-pension-additions', 'pension-divisor'] },
  { id: 'wz-payroll', region: '浙江温州', period: '2026-10', population: '企业职工 / 灵活就业', status: 'blocked', reason: '养老基数5122—25611及比例已核；完整包仍缺失业费率续期、温州医保当期降费、工伤核定及社保逐项舍入。不得沿用旧医保档次或往年失业降费率。', sourceIds: ['zj-contribution-base-2026', 'zj-contribution-explanation-2026', 'zj-unemployment-expiry'] },
  { id: 'pension-contribution-items', region: '北京、上海、浙江（含温州）', period: '仅2026-10已核验月份', population: '北京/浙江职工与限定灵活就业；上海仅灵活就业', status: 'partial', reason: '仅养老缴费单项：经办核定整数元基数、适用身份，乘积无分以下尾差。不是完整五险一金、工资成本或养老金待遇。', sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026', 'sh-contribution-base-2026', 'sh-flexible-pension', 'zj-contribution-base-2026', 'zj-contribution-explanation-2026'] },
  { id: 'cross-region', region: '跨省（含北京、上海、浙江）', period: '2026-10-12规则快照', population: '已核定普通企业职工养老关系与完整经历；已达待遇条件', status: 'partial', reason: '按户籍、基本关系、最后满120月顺序做省级判断；不推断温州市级经办地。临时账户、视同、重复关系和特殊转移拒判；不把各省养老金相加。', sourceIds: ['pension-transfer', 'pension-transfer-2016', 'pension-transfer-current'] },
  { id: 'special', region: '所有地区', period: '所有年份', population: '城乡居民养老、机关事业、视同缴费、过渡性、特殊工种、补缴', status: 'blocked', reason: '完整特殊待遇未实现，不能代入普通总额公式；仅北京/浙江经办已核标准基础单项可含已认定视同年限，不计算过渡分项。', sourceIds: ['sh-pension-2026'] },
];
