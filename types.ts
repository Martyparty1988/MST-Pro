export interface Worker {
  id?: number;
  name: string;
  hourlyRate: number;
  panelPrice: number;
  stringPrice: number;
  meterPrice: number;
  username?: string;
  password?: string;
  color?: string;
  createdAt: Date;
  projectIds?: number[]; // IDs of projects the worker is assigned to
}

export interface Project {
  id?: number;
  name: string;
  location?: string; // New
  description?: string;
  status: 'active' | 'completed' | 'on_hold';
  color?: string; // New: Hex color for UI branding
  tables?: { id: string; type?: 'S' | 'M' | 'L' }[];
  planFile?: File;
  googleSpreadsheetId?: string;
  hasPredefinedSizes?: boolean;
  lastSync?: Date;
  startDate?: string; // New
  endDate?: string; // New
  createdAt?: Date;
  updatedAt?: Date;
  workerIds?: number[]; // IDs of workers assigned to the project
}

export interface TimeRecord {
  id?: number;
  workerId: number;
  projectId: number;
  startTime: Date;
  endTime: Date;
  workType?: 'hourly' | 'task'; // New
  quantity?: number; // New: Number of tables/units
  tableType?: 'small' | 'medium' | 'large'; // New
  description: string;
  tableIds?: string[];
  projectTaskId?: number;
}

export interface User {
  username: string;
  role: 'user' | 'admin';
  workerId?: number;
}

export interface FieldTable {
  id?: number;
  projectId: number;
  tableId: string;
  tableType?: 'small' | 'medium' | 'large';
  status: 'pending' | 'completed' | 'defect';
  assignedWorkers?: number[];
  completedAt?: Date;
  completedBy?: number;
  defectNotes?: string;
  photos?: string[];
}

export interface SolarTable {
  id?: number;
  projectId: number;
  x: number;
  y: number;
  tableCode: string;
  tableType: 'small' | 'medium' | 'large';
  status: 'pending' | 'completed';
}

export interface TableAssignment {
  id?: number;
  tableId: number;
  workerId: number;
}

export interface PlanMarker {
  id?: number;
  projectId: number;
  workerId: number;
  x: number;
  y: number;
  page: number;
}

export interface AttendanceSession {
  id?: number;
  workerId: number;
  startTime: Date;
}

export type AttendanceStatus = 'present' | 'absent' | 'sick' | 'holiday';

export interface DailyLog {
  id?: number;
  date: string;
  workerId: number;
  status: AttendanceStatus;
  notes: string;
}

export interface ProjectTask {
  id?: number;
  projectId: number;
  taskType: 'panels' | 'construction' | 'cables';
  description: string;
  panelCount?: number;
  pricePerPanel?: number;
  tableSize?: 'small' | 'medium' | 'large';
  price: number;
  hoursSpent?: number;
  assignedWorkerId?: number;
  tableIds?: string[];
  completionDate?: Date;
  startTime?: Date;
  endTime?: Date;
}

export interface ProjectComponent {
  id?: number;
  projectId: number;
  name: string;
  description: string;
}

export interface AnnotationPath {
  color: string;
  strokeWidth: number;
  points: { x: number; y: number }[];
  tool: 'pencil' | 'eraser';
}

export interface PlanAnnotation {
  id?: number;
  projectId: number;
  page: number;
  paths: AnnotationPath[];
}

export interface TableStatusHistory {
  id?: number;
  tableId: number;
  workerId: number;
  status: 'pending' | 'completed';
  timestamp: Date;
}

export interface BackupMetadata {
  appVersion: string;
  itemsCount: {
    workers: number;
    projects: number;
    records: number;
  };
  dataSize: number;
}

export interface Backup {
  id?: number;
  version: string;
  timestamp: Date;
  type: 'auto' | 'manual';
  name?: string;
  data: string;
  metadata: BackupMetadata;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

export interface PromptTemplate {
  id: string;
  title: string;
  text: string;
  icon: string;
}

export interface CloudBackupFile {
  id: string;
  name: string;
  createdTime: string;
  size: string;
}

export type ToolStatus = 'available' | 'borrowed' | 'broken' | 'service' | 'lost';

export interface Tool {
  id?: number;
  name: string;
  type: string;
  category: 'asset' | 'consumable'; // Asset = trackable by S/N, Consumable = trackable by quantity
  brand?: string;
  serialNumber?: string;
  quantity?: number; // for consumables
  unit?: string; // pcs, m, box...
  status: ToolStatus;
  assignedWorkerId?: number;
  purchaseDate?: Date;
  notes?: string;
  lastInspection?: Date;
  location?: string;
  condition?: 1 | 2 | 3 | 4 | 5; // 1 = New, 5 = Ready for scrap
}

export interface ToolLog {
  id?: number;
  toolId: number;
  workerId: number;
  action: 'borrow' | 'return' | 'repair' | 'scrap';
  timestamp: Date;
  notes?: string;
}

export interface DailyReport {
  id?: number;
  date: string;
  projectId: number;
  stringsCompleted: number;
  notes: string;
  issues: string;
  managerEmail?: string;
  sentAt?: Date;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: number;
  senderName: string;
  timestamp: string;
  channelId: string;
  isSystem?: boolean;
  reactions?: Record<string, number[]>; // emoji: [userIds] (numbers)
  replyTo?: string; // id of referenced message
  imageUrl?: string; // for image messages
}
