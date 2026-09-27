/**
 * IPC 渲染进程 API 接口
 */
export interface IElectronAPI {
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
  off: (channel: string, ...args: any[]) => void;
  send: (channel: string, ...args: any[]) => void;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

// ──────────────────────────────────────────────
// PLC 协议数据类型
// ──────────────────────────────────────────────

export interface PlcAxis {
  /** 轴编号（1-based） */
  number: number
  /** CoDeSys 轴状态: 0=禁用, 1=待机, 2=回零, 3-5=运动中, 6=停止中, 7=错误停止, 8=错误 */
  state: number
  /** 实际位置 actPOSITION（DINT，脉冲数或工程单位） */
  actPosition: number
  /** 设定位置 setPOSITION（DINT，脉冲数或工程单位） */
  setPosition: number
  /** 速度（INT） */
  velocity: number
  /** 负载率（UINT，0-100%） */
  loadRate: number
  /** 驱动器温度（UINT，°C） */
  temperature: number
  /** 力矩（INT） */
  torque: number
  /** 执行器重量（INT） */
  weight: number
  maxDeviation: number
  minWeight: number
  maxWeight: number
  maxLoadRate: number
  minLoadRate: number
  /** 驱动器错误码（UINT，0=无错误） */
  errorId: number
  maxSpeed: number
}

export interface PlcModel {
  /** 模型在数组中的索引（0-based） */
  index: number
  /**
   * 模型类型（由 sendBuff 模型字节解码得出）：
   * - oneDof   → 单点/多级升降 (0x1E / 0x1F → 编码为 0x10-0x5F)
   * - twoDof   → 两点 (0x20，直接写入)
   * - threeDof → 多点 (0x3F → 编码为 0xA0-0xBF)
   * - fourDof  → 四点 (0x40，直接写入)
   * - car      → 车 (0xC0 → 编码为 0xC0+)
   */
  type: 'oneDof' | 'twoDof' | 'threeDof' | 'fourDof' | 'car'
  /** 模型名称 */
  name: string 
  /** 该模型包含的轴数量 */
  axisCount: number
  /** 该模型下所有轴的数据 */
  axes: PlcAxis[]

  // ── 模型级虚轴数据（模型段 36字节/模型）──
  /** 原始 MODEL_STATE 字节 */
  modelState: number
  /** 虚轴1：高度（DINT，整数单位） */
  posH: number
  /** 虚轴2：角度（存储时 ×10，解析后已 ÷10，保留一位小数） */
  posX: number
  /** 虚轴3：偏转（存储时 ×10，解析后已 ÷10，保留一位小数） */
  posY: number
  /** 虚轴3 偏转 量程 */
  maxY: number; minY: number
  /** 虚轴2 角度 量程 */
  maxX: number; minX: number
  /** 虚轴1 高度 量程 */
  maxH: number; minH: number
  /** 是否有激活的姿态目标值 */
  hasTarget: boolean
  /** 目标值 高度 */
  targetH: number
  /** 目标值 角度 */
  targetX: number
  /** 目标值 偏转 */
  targetY: number
  /** 是否有重量数据 */
  hasWeight: boolean
}

export interface PlcPacket {
  /** C口配置总轴数 */
  cPortTotal: number
  /** C口实际在线轴数 */
  cPortActive: number
  /** D口配置总轴数 */
  dPortTotal: number
  /** D口实际在线轴数 */
  dPortActive: number
  /** 所有模型（设备）列表 */
  models: PlcModel[]
  /** 轴排序数组（原始轴号按显示顺序排列） */
  axisOrder: number[]
  /** SYS_STATE 字节，变化时表示工程配置已改变需整体刷新 */
  sysState: number
  /** 数据包接收时间戳（ms） */
  timestamp: number
}

export interface PlcInfo {
  ip: string
  port: number
  multicastIp: string
  syncInterval: number
  wsPort: number
  connected: boolean
  projectId: string
  projectData: Device[]
}

export interface IPlcAPI {
  /** 订阅 PLC 实时数据推送 */
  onData: (cb: (packet: PlcPacket) => void) => void
  /** 取消订阅 */
  offData: (cb: (packet: PlcPacket) => void) => void

  onProjectData: (cb: (projectData: {projectId: string, devices: Device[]}) => void) => void
  offProjectData: (cb: (projectData: {projectId: string, devices: Device[]}) => void) => void
  /** 订阅 PLC 连接状态推送 */
  onConnectionStatus: (cb: ({connected: boolean}) => void) => void
  /** 取消订阅 PLC 连接状态推送 */
  offConnectionStatus: (cb: ({connected: boolean}) => void) => void
  /** 订阅 PLC 工程配置变动推送 */
  onSysStateChanged: (cb: (packet: PlcPacket) => void) => void
  /** 取消订阅 PLC 工程配置变动推送 */
  offSysStateChanged: (cb: (packet: PlcPacket) => void) => void
  /** 获取 PLC 信息 */
  getPlcInfo: () => Promise<PlcInfo>
}

// ──────────────────────────────────────────────
// WebSocket 项目数据类型
// ──────────────────────────────────────────────

export interface WsAxisData {
  axisId: string
  maxSpeed: number
  speed: number
  maxDeviation: number
  minWeight: number
  maxWeight: number
}

export interface WsModelData {
  modelId: string
  modelName: string
  uniqueId: string
  axisData: WsAxisData[]
}

export interface WsProjectMessage {
  projectId: string
  projectName: string
  projectStatus: boolean
  projectData: WsModelData[]
}

// 扩展 Window 接口
declare global {
  interface Window {
    ipcRenderer: IElectronAPI;
    plcAPI: IPlcAPI;
  }
}
