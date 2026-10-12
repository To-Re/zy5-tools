import type { ContributionPeriodRule, PayrollRule, PensionRule, TaxRule, RetirementRule, VerifiedPayrollRule } from './labor-engine';
import type { PensionContributionItemRule } from './labor-contribution-item';
import type { BenefitProvinceRule } from './labor-benefit-province';

/** Versioned public evidence only. No user inputs or private operational data belong here. */
export const LABOR_RULE_VERSION = '2026-10-12.1';
export interface LaborSource {
  id: string; title: string; url: string; authority: string;
  publishedAt: string | null; effectiveFrom: string | null; effectiveTo: string | null;
  verifiedAt: string; scope: string; note: string;
}
export const LABOR_SOURCES: Record<string, LaborSource> = {
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
    note: '官方比例图片明确职工养老个人8%、单位16%；正文个人参保养老20%。本版只采用养老单项，不推定其他险种舍入。',
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

/** Field-level provenance, displayed beside the public rule registry. */
export const LABOR_RULE_FIELDS: Array<{ field: string; value: string; scope: string; sourceIds: string[] }> = [
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
  { id: 'cn-tax', region: '中国大陆', period: '2026', population: '居民个人普通综合所得', status: 'supported', reason: '支持已核实收入额、专项扣除和附加扣除下的年度应纳税额及已缴差额；不自动判断汇算申报义务或减免。', sourceIds: ['iit-law', 'iit-withholding', 'iit-table'] },
  { id: 'cn-retirement', region: '中国大陆', period: '2025起（2026-10-12政策快照）', population: '原50/55/60类别已确认的普通企业职工', status: 'partial', reason: '按出生年月算退休日期和最低年限；不替代身份、程序、领取地或完整待遇资格核定。', sourceIds: ['retirement-reform', 'retirement-flexible'] },
  { id: 'verified-payroll', region: '中国大陆（实缴金额模式）', period: '2026-10至2026-12', population: '居民普通工资；缴费与可扣金额已核实', status: 'partial', reason: '计算实发、单位已填成本及固定实缴下的税前反推；不自动核定五险一金基数、比例或金额。', sourceIds: ['social-insurance-law', 'housing-fund-2026', 'iit-withholding'] },
  { id: 'sh-pension', region: '上海', period: '2026-08-16至年底退休情景（办法本身有效至2031-08-15）', population: '无视同/过渡性待遇，整周岁表内年龄且关键参数已核定', status: 'partial', reason: '固定规则金额情景、账户余额单变量目标逆算及领取窗口累计。历史指数不自动推导，不预测未来工资、利息、政策。', sourceIds: ['sh-pension-2026', 'pension-divisor', 'pension-window'] },
  { id: 'sh-payroll', region: '上海', period: '2026-10', population: '企业职工 / 灵活就业', status: 'blocked', reason: '完整五险一金包及逐项地方舍入证据尚未齐备，拒绝依赖它的税后工资和单位总成本。', sourceIds: [] },
  { id: 'sz-payroll', region: '深圳', period: '2026-10', population: '企业职工 / 灵活就业', status: 'blocked', reason: '户籍、医保档次、公积金个人免缴及不等比例、工伤浮动和新入职下限不能统一套算；完整依据尚未齐备。', sourceIds: [] },
  { id: 'bj-payroll', region: '北京', period: '2026-10', population: '企业职工 / 灵活就业', status: 'blocked', reason: '社保基数7270—36348已核；仍缺社保逐险逐方舍入、单位工伤核定与完整特殊缴存条件，不能自动输出完整合计。', sourceIds: ['bj-contribution-2026'] },
  { id: 'bj-pension', region: '北京', period: '2026', population: '企业职工养老金', status: 'blocked', reason: '金额规则尚未启用：当期计发参数、地方指数口径、低指数处理、过渡性边界和分项舍入须完整核验。不能套上海公式或把手填金额当作北京待遇。', sourceIds: ['pension-divisor'] },
  { id: 'zj-pension', region: '浙江（重点温州）', period: '2026', population: '企业职工养老金', status: 'blocked', reason: '8537元计发参数已核，仍缺当前补贴/调节金、最低待遇补足、历史指数、年限精度与舍入完整依据，不能把基础与个人账户两项之和称作浙江养老金总额。', sourceIds: ['zj-contribution-base-2026', 'zj-contribution-explanation-2026', 'zj-pension-additions', 'pension-divisor'] },
  { id: 'wz-payroll', region: '浙江温州', period: '2026-10', population: '企业职工 / 灵活就业', status: 'blocked', reason: '养老基数5122—25611及比例已核；完整包仍缺失业费率续期、温州医保当期降费、工伤核定、公积金及各项舍入。不得沿用旧医保档次或往年失业降费率。', sourceIds: ['zj-contribution-base-2026', 'zj-contribution-explanation-2026', 'zj-unemployment-expiry'] },
  { id: 'pension-contribution-items', region: '北京、上海、浙江（含温州）', period: '仅2026-10已核验月份', population: '北京/浙江职工与限定灵活就业；上海仅灵活就业', status: 'partial', reason: '仅养老缴费单项：经办核定整数元基数、适用身份，乘积无分以下尾差。不是完整五险一金、工资成本或养老金待遇。', sourceIds: ['bj-contribution-2026', 'bj-contribution-rates-2026', 'sh-contribution-base-2026', 'sh-flexible-pension', 'zj-contribution-base-2026', 'zj-contribution-explanation-2026'] },
  { id: 'cross-region', region: '跨省（含北京、上海、浙江）', period: '2026-10-12规则快照', population: '已核定普通企业职工养老关系与完整经历；已达待遇条件', status: 'partial', reason: '按户籍、基本关系、最后满120月顺序做省级判断；不推断温州市级经办地。临时账户、视同、重复关系和特殊转移拒判；不把各省养老金相加。', sourceIds: ['pension-transfer', 'pension-transfer-2016', 'pension-transfer-current'] },
  { id: 'special', region: '所有地区', period: '所有年份', population: '城乡居民养老、机关事业、视同缴费、过渡性、特殊工种、补缴', status: 'blocked', reason: '制度和待遇组成不同，未实现的适用规则不代入普通企业职工公式。', sourceIds: ['sh-pension-2026'] },
];
