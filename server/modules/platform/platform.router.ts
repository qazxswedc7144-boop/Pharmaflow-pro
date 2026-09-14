// server/modules/platform/platform.router.ts
// Platform Owner Control Plane Express API Router for Phase 8.6

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { PlatformService } from './platform.service';
import { PlatformAuditService } from './platform-audit.service';
import { DeviceService } from '../sync/device.service';

export const platformRouter = Router();

// Middleware: All Platform API routes require valid JWT authentication
platformRouter.use(authenticateToken);

/**
 * 1. GET /api/platform/dashboard
 * Aggregated metrics across all tenants, branches, subscriptions, financials, and sync health
 */
platformRouter.get('/dashboard', requirePermission('platform.dashboard.view'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await PlatformService.getDashboardMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 2. GET /api/platform/tenants
 * List all tenants with status and plan filters, pagination, search
 */
platformRouter.get('/tenants', requirePermission('platform.tenants.read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const plan = req.query.plan as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = await PlatformService.getTenants({ search, status, plan, limit, offset });
    res.json({
      success: true,
      data: result.tenants,
      total: result.total,
      limit,
      offset
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 3. GET /api/platform/tenants/:id
 * Detailed profile of a specific tenant (branches, users, license, devices, sync, audit)
 */
platformRouter.get('/tenants/:id', requirePermission('platform.tenants.read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'معرف المستأجر مطلوب' });
      return;
    }

    const details = await PlatformService.getTenantDetails(id);
    res.json({
      success: true,
      data: details
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 4. POST /api/platform/tenants
 * Provision a new tenant atomically with admin user, default branch, subscription, and license
 */
platformRouter.post('/tenants', requirePermission('platform.tenants.create'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const {
      name,
      legalName,
      domain,
      country,
      currency,
      timezone,
      adminUsername,
      adminPassword,
      branchName,
      planCode,
      trialDays
    } = req.body;

    const result = await PlatformService.createTenant({
      name,
      legalName,
      domain,
      country,
      currency,
      timezone,
      adminUsername,
      adminPassword,
      branchName,
      planCode,
      trialDays,
      actorId,
      actorUsername,
      ipAddress
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء وتهيئة المستأجر السحابي بنجاح.',
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 5. PUT /api/platform/tenants/:id/status
 * Transition tenant lifecycle status (ACTIVE, SUSPENDED, DEACTIVATED, TRIAL)
 */
platformRouter.put('/tenants/:id/status', requirePermission('platform.tenants.suspend'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { id } = req.params;
    const { status, reason } = req.body;

    if (!id || !status) {
      res.status(400).json({ success: false, error: 'معرف المستأجر والحالة الجديدة مطلوبان' });
      return;
    }

    const result = await PlatformService.updateTenantStatus({
      tenantId: id,
      status,
      reason: reason || 'تحديث الحالة من قبل إدارة المنصة',
      actorId,
      actorUsername,
      ipAddress
    });

    res.json({
      success: true,
      message: `تم تحديث حالة المستأجر إلى ${status} بنجاح.`,
      data: result.tenant
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 6. POST /api/platform/tenants/:id/plan
 * Change/upgrade tenant subscription plan
 */
platformRouter.post('/tenants/:id/plan', requirePermission('platform.subscriptions.manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { id } = req.params;
    const { planCode, durationDays, reason } = req.body;

    if (!id || !planCode) {
      res.status(400).json({ success: false, error: 'معرف المستأجر ورمز الخطة مطلوبان' });
      return;
    }

    const result = await PlatformService.changeTenantPlan({
      tenantId: id,
      newPlanCode: planCode,
      durationDays,
      reason: reason || 'ترقية/تعديل الخطة من إدارة المنصة',
      actorId,
      actorUsername,
      ipAddress
    });

    res.json({
      success: true,
      message: 'تم تحديث خطة الاشتراك وإصدار ترخيص رقمي جديد.',
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 7. GET /api/platform/branches
 * Cross-tenant branch inspection
 */
platformRouter.get('/branches', requirePermission('platform.branches.read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const sampleBranches = [
      { id: 'BRH-DALL-01', code: 'BR-101', name: 'فرع مستشفى دله الرئيسي', tenantId: 'TEN_MAIN_DALLAH_09', tenantName: 'مستشفى دله وصيدلياتها', city: 'الرياض', isActive: true, usersCount: 5, devicesCount: 4, lastSync: new Date().toISOString() },
      { id: 'BRH-DALL-02', code: 'BR-102', name: 'فرع النخيل التخصصي', tenantId: 'TEN_MAIN_DALLAH_09', tenantName: 'مستشفى دله وصيدلياتها', city: 'الرياض', isActive: true, usersCount: 3, devicesCount: 2, lastSync: new Date(Date.now() - 300000).toISOString() },
      { id: 'BRH-ALNO-01', code: 'BR-201', name: 'صيدلية النور - شارع الزبيري', tenantId: 'TEN_ALNOOR_PHARMA_02', tenantName: 'صيدليات النور الحديثة', city: 'صنعاء', isActive: true, usersCount: 2, devicesCount: 2, lastSync: new Date(Date.now() - 600000).toISOString() },
      { id: 'BRH-SHIF-01', code: 'BR-301', name: 'صيدلية الشفاء التجريبية', tenantId: 'TEN_SHIFA_TRIAL_03', tenantName: 'صيدلية الشفاء السريعة (تجريبي)', city: 'جدة', isActive: true, usersCount: 2, devicesCount: 1, lastSync: new Date(Date.now() - 1800000).toISOString() }
    ];

    let filtered = sampleBranches;
    if (tenantId) {
      filtered = filtered.filter(b => b.tenantId === tenantId);
    }

    res.json({
      success: true,
      data: filtered,
      total: filtered.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 8. GET /api/platform/users
 * Cross-tenant user inspection
 */
platformRouter.get('/users', requirePermission('platform.users.read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const sampleUsers = [
      { id: 'usr-101', username: 'dallah_admin', role: 'TENANT_ADMIN', tenantId: 'TEN_MAIN_DALLAH_09', tenantName: 'مستشفى دله وصيدلياتها', branchName: 'الفرع الرئيسي', isActive: true, lastLoginAt: new Date().toISOString() },
      { id: 'usr-102', username: 'dallah_accountant', role: 'ACCOUNTANT', tenantId: 'TEN_MAIN_DALLAH_09', tenantName: 'مستشفى دله وصيدلياتها', branchName: 'الفرع الرئيسي', isActive: true, lastLoginAt: new Date(Date.now() - 7200000).toISOString() },
      { id: 'usr-201', username: 'alnoor_owner', role: 'TENANT_ADMIN', tenantId: 'TEN_ALNOOR_PHARMA_02', tenantName: 'صيدليات النور الحديثة', branchName: 'شارع الزبيري', isActive: true, lastLoginAt: new Date(Date.now() - 3600000).toISOString() },
      { id: 'usr-301', username: 'shifa_user', role: 'PHARMACIST', tenantId: 'TEN_SHIFA_TRIAL_03', tenantName: 'صيدلية الشفاء السريعة (تجريبي)', branchName: 'الفرع التجريبي', isActive: true, lastLoginAt: new Date(Date.now() - 1800000).toISOString() }
    ];

    let filtered = sampleUsers;
    if (tenantId) {
      filtered = filtered.filter(u => u.tenantId === tenantId);
    }

    res.json({
      success: true,
      data: filtered,
      total: filtered.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 9. GET /api/platform/devices
 * Cross-tenant device list
 */
platformRouter.get('/devices', requirePermission('platform.devices.read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = (req.query.tenantId as string) || '*';
    const devices = DeviceService.getTenantDevices(tenantId);
    res.json({
      success: true,
      data: devices,
      total: devices.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 10. PUT /api/platform/devices/:id/status
 * Update device security status (ACTIVE, SUSPENDED, REVOKED)
 */
platformRouter.put('/devices/:id/status', requirePermission('platform.devices.revoke'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { id } = req.params;
    const { tenantId, status, reason } = req.body;

    if (!id || !tenantId || !status) {
      res.status(400).json({ success: false, error: 'معرف الجهاز والمستأجر والحالة الجديدة مطلوبان' });
      return;
    }

    const result = await PlatformService.updateDeviceStatus({
      tenantId,
      deviceId: id,
      status,
      reason,
      actorId,
      actorUsername,
      ipAddress
    });

    res.json({
      success: true,
      message: `تم تحديث حالة أمان الجهاز إلى ${status} بنجاح.`,
      data: result.device
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 11. GET /api/platform/sync/monitoring
 * Cross-tenant sync performance and conflict monitoring
 */
platformRouter.get('/sync/monitoring', requirePermission('platform.sync.read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await PlatformService.getDashboardMetrics();
    res.json({
      success: true,
      data: {
        syncHealth: metrics.syncHealth,
        systemHealth: metrics.systemHealth,
        activeTenantsInSync: metrics.tenants.active,
        totalDevicesSynced: metrics.devices.active
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 12. POST /api/platform/sync/diagnostics
 * Execute safe diagnostic operations on sync pipelines
 */
platformRouter.post('/sync/diagnostics', requirePermission('platform.sync.manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { tenantId, action, deviceId } = req.body;
    if (!tenantId || !action) {
      res.status(400).json({ success: false, error: 'معرف المستأجر ونوع الإجراء التشخيصي مطلوبان' });
      return;
    }

    const result = await PlatformService.runSyncDiagnostics({
      tenantId,
      action,
      deviceId,
      actorId,
      actorUsername,
      ipAddress
    });

    res.json({
      success: true,
      message: result.message,
      data: result.details
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 13. GET /api/platform/audit/events
 * Platform audit stream with filters
 */
platformRouter.get('/audit/events', requirePermission('platform.audit.read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const resource = req.query.resource as string | undefined;
    const action = req.query.action as string | undefined;
    const severity = req.query.severity as any;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = PlatformAuditService.getEvents({
      tenantId,
      resource,
      action,
      severity,
      search,
      limit,
      offset
    });

    res.json({
      success: true,
      data: result.logs,
      total: result.total,
      limit,
      offset
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 14. GET /api/platform/security/events
 * Security specific event stream (critical/high severity)
 */
platformRouter.get('/security/events', requirePermission('platform.security.read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const events = PlatformAuditService.getSecurityEvents(100);
    res.json({
      success: true,
      data: events,
      total: events.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 15. GET /api/platform/system/health
 * System infrastructure health and diagnostics
 */
platformRouter.get('/system/health', requirePermission('platform.system.health'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const health = await PlatformService.getSystemHealth();
    res.json({
      success: true,
      data: health
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 16. GET & PUT /api/platform/feature-flags
 * Feature flag management
 */
platformRouter.get('/feature-flags', requirePermission('platform.dashboard.view'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const flags = PlatformService.getFeatureFlags();
    res.json({
      success: true,
      data: flags
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

platformRouter.put('/feature-flags/:key', requirePermission('platform.system.diagnostics'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';
    const key = req.params.key;
    if (!key) {
      res.status(400).json({ success: false, error: 'رمز الميزة مطلوب' });
      return;
    }
    const { isEnabledGlobally, tenantOverrides } = req.body;

    const updated = PlatformService.updateFeatureFlag({
      key,
      isEnabledGlobally,
      tenantOverrides,
      actorId,
      actorUsername
    });

    res.json({
      success: true,
      message: `تم تحديث الميزة ${key} بنجاح.`,
      data: updated
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 17. GET & PUT /api/platform/version-policy
 * Client Version Policy
 */
platformRouter.get('/version-policy', requirePermission('platform.dashboard.view'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const policy = PlatformService.getVersionPolicy();
    res.json({ success: true, data: policy });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

platformRouter.put('/version-policy', requirePermission('platform.system.diagnostics'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';

    const updated = PlatformService.updateVersionPolicy(req.body, { id: actorId, username: actorUsername });
    res.json({ success: true, message: 'تم تحديث سياسة إصدارات العميل بنجاح.', data: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 18. GET, POST, REVOKE /api/platform/api-keys
 * Secure API Key management
 */
platformRouter.get('/api-keys', requirePermission('platform.api.read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const keys = PlatformService.getApiKeys();
    res.json({ success: true, data: keys });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

platformRouter.post('/api-keys', requirePermission('platform.api.manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';
    const { tenantId, tenantName, name, scopes } = req.body;

    if (!tenantId || !name || !scopes) {
      res.status(400).json({ success: false, error: 'معرف المستأجر واسم المفتاح والصلاحيات حقول مطلوبة' });
      return;
    }

    const { record, rawSecretKey } = PlatformService.createApiKey({
      tenantId,
      tenantName: tenantName || tenantId,
      name,
      scopes,
      actorId,
      actorUsername
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء مفتاح الربط البرمجي بنجاح. يرجى نسخ المفتاح الآن، فلن يظهر مرة أخرى.',
      data: {
        record,
        rawSecretKey
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

platformRouter.post('/api-keys/:id/revoke', requirePermission('platform.api.manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.userId || 'PLATFORM_OWNER';
    const actorUsername = authReq.user?.username || 'SuperAdmin';
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ success: false, error: 'معرف المفتاح مطلوب' });
      return;
    }

    const ok = PlatformService.revokeApiKey(id, { id: actorId, username: actorUsername });
    if (!ok) {
      res.status(404).json({ success: false, error: 'مفتاح الربط غير موجود' });
      return;
    }

    res.json({ success: true, message: 'تم إلغاء تفعيل مفتاح الربط بنجاح.' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 19. GET /api/platform/webhooks
 * Webhooks events log stream
 */
platformRouter.get('/webhooks', requirePermission('platform.api.read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const logs = PlatformService.getWebhookLogs();
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

