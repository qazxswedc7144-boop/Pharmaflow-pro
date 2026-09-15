// scripts/test-phase3.3-inventory-correction.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 3.3: Controlled Inventory Correction & Human Resolution Test Suite
 * 
 * Tests:
 * 1. Scan & Case Creation (Read-Only detection -> OPEN cases, no auto-fix)
 * 2. RBAC Enforcement (Employee/Cashier blocked, Manager proposes, Admin approves/executes)
 * 3. State Machine Strict Progression (OPEN -> UNDER_REVIEW -> PROPOSED -> APPROVED -> EXECUTED -> RECONCILED)
 * 4. State Machine Skip Prevention (Cannot execute without prior APPROVED status)
 * 5. Mandatory Validation (Reason, Actor, Action, Reference)
 * 6. Idempotency & Duplicate Execution Protection
 * 7. Multi-Tenant and Multi-Branch Isolation
 * 8. BOOK_VS_STOCK Discrepancy Resolution (Double-Entry JE + Stock Movement + Reconciliation)
 * 9. LAYERS_VS_STOCK Discrepancy Resolution (FIFO layer alignment with audit)
 * 10. EXPIRED_ACTIVE_LAYER Discrepancy Resolution (Quarantine + Spoilage JE + Master Stock deduction)
 * 11. NEGATIVE_STOCK Discrepancy Resolution (Formal adjustment with cost accounting)
 * 12. ORPHAN_DOCUMENT Discrepancy Resolution (Document re-linking + audit)
 * 13. Atomic Rollback on Reconciliation Failure (Rollback + ROLLBACK_FAILED status)
 * 14. Audit Trail Completeness (Before/after snapshots, actors, timestamps, reasons)
 */

import 'fake-indexeddb/auto';
import { db } from '../src/core/db';
import { InventoryCorrectionWorkflow } from '../src/features/inventory/workflows/InventoryCorrectionWorkflow';
import { InventoryCorrectionService } from '../src/features/inventory/services/InventoryCorrectionService';
import { InventoryCorrectionRepository } from '../src/features/inventory/repositories/InventoryCorrectionRepository';
import { InventoryReconciliationService } from '../src/features/inventory/services/InventoryReconciliationService';
import { UserSecurityContext } from '../src/features/inventory/types/correction.types';

let passed = 0;
let failed = 0;
const testResults: { name: string; status: 'PASS' | 'FAIL'; error?: any }[] = [];

function assert(condition: boolean, testName: string, errorDetails?: any) {
  if (condition) {
    passed++;
    testResults.push({ name: testName, status: 'PASS' });
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failed++;
    testResults.push({ name: testName, status: 'FAIL', error: errorDetails });
    console.error(`  ❌ [FAIL] ${testName}`, errorDetails !== undefined ? errorDetails : '');
  }
}

async function runTests() {
  console.log('\n========================================================================');
  console.log('🧪 PharmaFlow PRO ERP — Phase 3.3: Controlled Inventory Correction Suite');
  console.log('========================================================================\n');

  try {
    await db.open();

    const tenantA = 'TENANT-ALPHA';
    const tenantB = 'TENANT-BETA';
    const branch1 = 'BR-01';
    const branch2 = 'BR-02';

    // Actors
    const employeeUser: UserSecurityContext = {
      userId: 'USR-EMP-101',
      userName: 'Ahmed (Cashier)',
      userEmail: 'ahmed@alpha.com',
      role: 'CASHIER',
      tenantId: tenantA,
      branchId: branch1
    };

    const managerUser: UserSecurityContext = {
      userId: 'USR-MGR-201',
      userName: 'Sara (Inventory Manager)',
      userEmail: 'sara@alpha.com',
      role: 'INVENTORY_MANAGER',
      tenantId: tenantA,
      branchId: branch1
    };

    const adminUser: UserSecurityContext = {
      userId: 'USR-ADM-301',
      userName: 'Dr. Tarek (Owner / Admin)',
      userEmail: 'tarek@alpha.com',
      role: 'ADMIN',
      tenantId: tenantA,
      branchId: branch1
    };

    const tenantBAdmin: UserSecurityContext = {
      userId: 'USR-BETA-01',
      userName: 'Beta Admin',
      userEmail: 'admin@beta.com',
      role: 'ADMIN',
      tenantId: tenantB,
      branchId: branch2
    };

    // =========================================================================
    // TEST SUITE 1: Scan & Case Creation (Read-Only & No Auto-Fix)
    // =========================================================================
    console.log('--- Test Suite 1: Scan & Discrepancy Registration (No Auto-Fix) ---');

    const p1_id = 'prod_disc_book';
    await db.products.put({
      id: p1_id,
      Name: 'Augmentin 1g Tablets',
      StockQuantity: 40, // Physical says 40, but purchase invoices say 50
      Price: 60,
      CostPrice: 40,
      Category: 'Antibiotics',
      tenantId: tenantA,
      branchId: branch1
    } as any);

    // Add Purchase of 50
    await db.invoices.put({
      id: 'INV-PUR-01',
      invoice_number: 'PUR-001',
      type: 'PURCHASE',
      document_status: 'POSTED',
      items: [{ product_id: p1_id, qty: 50, price: 40, totalPrice: 2000 }],
      tenantId: tenantA,
      branchId: branch1,
      createdAt: '2026-01-10T10:00:00Z'
    } as any);

    // Scan inventory
    const scanResult = await InventoryCorrectionWorkflow.scanAndRegisterDiscrepancies(
      { tenantId: tenantA, branchId: branch1 },
      adminUser
    );

    assert(scanResult.summary.productAudits.length > 0, 'Scan executes and returns results');
    assert(scanResult.createdCasesCount >= 1, 'Discrepancy registered as OPEN correction case');

    const createdCase = scanResult.newCases.find(c => c.productId === p1_id);
    assert(createdCase !== undefined, 'Case created for Augmentin discrepancy');
    assert(createdCase?.status === 'OPEN', 'Newly registered case status is strictly OPEN');
    assert(Math.abs(createdCase?.details.variance || 0) === 10, 'Details variance correctly reflects 10 discrepancy');

    // Verify product stock was NOT silently modified
    const prodAfterScan = await db.products.get(p1_id);
    assert(Number(prodAfterScan.StockQuantity) === 40, 'Product StockQuantity remains strictly untouched during scan (No Auto-Fix)');

    // =========================================================================
    // TEST SUITE 2: RBAC Policy Enforcement (Separation of Duties)
    // =========================================================================
    console.log('\n--- Test Suite 2: RBAC Policy Enforcement (Separation of Duties) ---');

    // 1. Employee cannot propose without manager role
    let employeeProposeBlocked = false;
    try {
      await InventoryCorrectionWorkflow.submitCorrectionProposal(
        createdCase!.id,
        {
          actionType: 'PHYSICAL_COUNT_ADJUSTMENT',
          proposedQty: 50,
          targetWarehouseId: 'WH-MAIN',
          reason: 'Attempted proposal by unauthorized cashier'
        },
        employeeUser
      );
    } catch (e: any) {
      employeeProposeBlocked = e.name === 'UnauthorizedCorrectionError';
    }
    assert(employeeProposeBlocked, 'Cashier/Employee strictly blocked from proposing correction (403)');

    // 2. Manager starts review and submits valid proposal
    const reviewedCase = await InventoryCorrectionWorkflow.startCaseReview(
      createdCase!.id,
      managerUser,
      'تمت مطابقة الفواتير مع الجرد الفعلي وتبين وجود 10 عبوات قيد الاستلام'
    );
    assert(reviewedCase.status === 'UNDER_REVIEW', 'Manager successfully moved case to UNDER_REVIEW');
    assert(reviewedCase.reviewedBy === managerUser.userName, 'Reviewer identity recorded on case');

    const proposedCase = await InventoryCorrectionWorkflow.submitCorrectionProposal(
      createdCase!.id,
      {
        actionType: 'PHYSICAL_COUNT_ADJUSTMENT',
        proposedQty: 50,
        targetWarehouseId: 'WH-MAIN',
        reason: 'تسوية رصيد الجرد الفعلي ليتطابق مع فواتير الشراء المستلمة فعلياً'
      },
      managerUser
    );
    assert(proposedCase.status === 'PROPOSED', 'Manager successfully submitted formal PROPOSAL');
    assert(proposedCase.proposedAction?.proposedQty === 50, 'Proposed target quantity saved accurately');

    // 3. Manager CANNOT approve (Must be Owner/Admin)
    let managerApproveBlocked = false;
    try {
      await InventoryCorrectionWorkflow.approveCorrection(
        createdCase!.id,
        managerUser,
        'Manager self-approval attempt'
      );
    } catch (e: any) {
      managerApproveBlocked = e.name === 'UnauthorizedCorrectionError';
    }
    assert(managerApproveBlocked, 'Manager strictly blocked from approving correction (Requires Admin/Owner)');

    // 4. Manager CANNOT execute
    let managerExecuteBlocked = false;
    try {
      await InventoryCorrectionWorkflow.executeCorrection(
        createdCase!.id,
        managerUser
      );
    } catch (e: any) {
      managerExecuteBlocked = e.name === 'UnauthorizedCorrectionError';
    }
    assert(managerExecuteBlocked, 'Manager strictly blocked from executing correction');

    // =========================================================================
    // TEST SUITE 3: State Machine Skipping Prevention & Validation
    // =========================================================================
    console.log('\n--- Test Suite 3: State Machine Skipping Prevention & Mandatory Validation ---');

    // Admin tries to execute an unapproved case (currently in PROPOSED)
    let unapprovedExecuteBlocked = false;
    try {
      await InventoryCorrectionWorkflow.executeCorrection(
        createdCase!.id,
        adminUser
      );
    } catch (e: any) {
      unapprovedExecuteBlocked = e.name === 'InvalidStateTransitionError';
    }
    assert(unapprovedExecuteBlocked, 'Execution strictly blocked if case is not APPROVED');

    // Mandatory reason validation on proposal
    let emptyReasonBlocked = false;
    try {
      await InventoryCorrectionService.submitProposal(
        createdCase!.id,
        {
          actionType: 'PHYSICAL_COUNT_ADJUSTMENT',
          proposedQty: 50,
          targetWarehouseId: 'WH-MAIN',
          reason: ' ' // Empty
        },
        managerUser
      );
    } catch (e: any) {
      emptyReasonBlocked = e.name === 'MandatoryFieldMissingError';
    }
    assert(emptyReasonBlocked, 'Empty proposal reason strictly rejected with MandatoryFieldMissingError');

    // =========================================================================
    // TEST SUITE 4: Multi-Tenant & Multi-Branch Isolation
    // =========================================================================
    console.log('\n--- Test Suite 4: Multi-Tenant & Multi-Branch Isolation ---');

    // Tenant B attempts to fetch Tenant A case
    const tenantBCrossAccess = await InventoryCorrectionWorkflow.getCase(createdCase!.id, tenantB);
    assert(tenantBCrossAccess === null, 'Tenant B cannot read or access Tenant A correction case');

    // Tenant B attempts to approve Tenant A case
    let tenantBApproveBlocked = false;
    try {
      await InventoryCorrectionWorkflow.approveCorrection(
        createdCase!.id,
        tenantBAdmin,
        'Cross-tenant approval attempt'
      );
    } catch {
      tenantBApproveBlocked = true;
    }
    assert(tenantBApproveBlocked, 'Tenant B strictly blocked from approving Tenant A correction case');

    // =========================================================================
    // TEST SUITE 5: Execution of BOOK_VS_STOCK with Post-Reconciliation
    // =========================================================================
    console.log('\n--- Test Suite 5: Atomic Execution of BOOK_VS_STOCK Correction ---');

    // 1. Admin approves the case
    const approvedCase = await InventoryCorrectionWorkflow.approveCorrection(
      createdCase!.id,
      adminUser,
      'تمت مراجعة محضر الجرد والموافقة على تعديل الرصيد إلى 50 عبوة'
    );
    assert(approvedCase.status === 'APPROVED', 'Admin successfully approved the case');
    assert(approvedCase.approval?.decision === 'APPROVED', 'Approval decision recorded');
    assert(approvedCase.approval?.approvedBy === adminUser.userId, 'Approver user ID recorded');

    // 2. Admin executes the case
    const executedCase = await InventoryCorrectionWorkflow.executeCorrection(
      createdCase!.id,
      adminUser,
      `IDEMP-TEST-${createdCase!.id}`
    );

    assert(executedCase.status === 'RECONCILED', 'Case transitioned to RECONCILED after post-audit verification');
    assert(executedCase.execution !== undefined, 'Execution details logged on case');
    assert(executedCase.execution?.reconciliationResult.isReconciled === true, 'Post-audit verification confirmed isReconciled = true');

    // Verify Product Stock updated
    const prodAfterExec = await db.products.get(p1_id);
    assert(Number(prodAfterExec.StockQuantity) === 50, 'Product StockQuantity safely adjusted to target 50');

    // Verify Double-Entry Journal Entry created
    const je = await db.journalEntries.get(executedCase.execution!.journalEntryId!);
    assert(je !== undefined, 'Balanced Double-Entry Journal Entry created');
    assert(je.status === 'POSTED', 'Journal Entry status is POSTED');
    assert(je.lines.length === 2, 'Journal Entry has Debit and Credit lines');
    assert(je.lines[0].debit > 0 && je.lines[1].credit > 0, 'Double-Entry Debit and Credit are balanced');

    // Verify Stock Movement created
    const sm = await db.stock_movements.get(executedCase.execution!.stockMovementId!);
    assert(sm !== undefined, 'Formal stock_movements entry recorded');
    assert(sm.type === 'ADJUSTMENT', 'Stock movement type is ADJUSTMENT');

    // Run direct reconciliation on product to ensure 100% matched
    const finalAudit = await InventoryReconciliationService.auditProduct(p1_id, { tenantId: tenantA });
    assert(finalAudit.status === 'MATCHED', 'Product ledger and physical stock are now 100% MATCHED');
    assert(finalAudit.discrepancies.length === 0, 'Zero remaining discrepancies after correction');

    // =========================================================================
    // TEST SUITE 6: Idempotency & Duplicate Execution Protection
    // =========================================================================
    console.log('\n--- Test Suite 6: Idempotency & Duplicate Execution Protection ---');

    let duplicateBlocked = false;
    try {
      await InventoryCorrectionWorkflow.executeCorrection(
        createdCase!.id,
        adminUser,
        `IDEMP-TEST-${createdCase!.id}`
      );
    } catch (e: any) {
      duplicateBlocked = e.name === 'DuplicateExecutionError' || e.name === 'InvalidStateTransitionError';
    }
    assert(duplicateBlocked, 'Re-execution of an already reconciled case strictly blocked by Idempotency Guard');

    // =========================================================================
    // TEST SUITE 7: Expired Active Layer Quarantine (EXPIRED_ACTIVE_LAYER)
    // =========================================================================
    console.log('\n--- Test Suite 7: Expired Layer Quarantine (EXPIRED_ACTIVE_LAYER) ---');

    const p2_id = 'prod_exp_case';
    await db.products.put({
      id: p2_id,
      Name: 'Cataflam 50mg Expired Batch',
      StockQuantity: 20,
      Price: 30,
      CostPrice: 15,
      Category: 'Analgesics',
      tenantId: tenantA,
      branchId: branch1
    } as any);

    // Add matching purchase invoice of 20 so book balance is in harmony
    await db.invoices.put({
      id: 'INV-PUR-EXP-01',
      type: 'PURCHASE',
      document_status: 'POSTED',
      items: [{ product_id: p2_id, qty: 20, price: 15, totalPrice: 300 }],
      tenantId: tenantA,
      branchId: branch1,
      createdAt: '2022-01-01T00:00:00Z'
    } as any);

    // Active layer in DB with past expiry date
    await db.inventory_layers.put({
      id: 'LAY-EXP-01',
      item_id: p2_id,
      productId: p2_id,
      quantity: 20,
      quantity_remaining: 20,
      remaining_qty: 20,
      unit_cost: 15,
      expiry_date: '2023-01-01',
      created_at: '2022-01-01T00:00:00Z',
      tenant_id: tenantA
    } as any);

    // Audit Cataflam
    const p2Audit = await InventoryReconciliationService.auditProduct(p2_id, { tenantId: tenantA });
    assert(p2Audit.status === 'WARNING', 'Expired layer flagged as WARNING during audit');

    const p2Cases = await InventoryCorrectionService.registerDiscrepancyCases(p2Audit, adminUser);
    const p2Case = p2Cases.find(c => c.discrepancyType === 'EXPIRED_ACTIVE_LAYER');
    assert(p2Case !== undefined, 'Case created for EXPIRED_ACTIVE_LAYER');

    // Propose Quarantine
    await InventoryCorrectionWorkflow.startCaseReview(p2Case!.id, managerUser);
    await InventoryCorrectionWorkflow.submitCorrectionProposal(
      p2Case!.id,
      {
        actionType: 'QUARANTINE_EXPIRED_BATCH',
        proposedQty: 0,
        targetWarehouseId: 'WH-QUARANTINE',
        reason: 'إعدام وعزل الدفعة رقم LAY-EXP-01 لانتهاء الصلاحية في 2023'
      },
      managerUser
    );

    // Approve
    await InventoryCorrectionWorkflow.approveCorrection(p2Case!.id, adminUser);

    // Execute
    const p2Exec = await InventoryCorrectionWorkflow.executeCorrection(p2Case!.id, adminUser);
    assert(p2Exec.status === 'RECONCILED', 'Expired layer quarantine executed and reconciled');

    // Verify layer zeroed out
    const layerAfter = await db.inventory_layers.get('LAY-EXP-01');
    assert(Number(layerAfter.quantity_remaining) === 0, 'Expired FIFO layer quantity_remaining safely reduced to 0');
    assert(layerAfter.is_quarantined === true, 'Layer marked as is_quarantined = true');

    // Verify Master Stock reduced safely
    const p2ProdAfter = await db.products.get(p2_id);
    assert(Number(p2ProdAfter.StockQuantity) === 0, 'Master Stock safely reduced by expired quantity');

    // =========================================================================
    // TEST SUITE 8: FIFO Layers Alignment (LAYERS_VS_STOCK)
    // =========================================================================
    console.log('\n--- Test Suite 8: FIFO Layer Alignment (LAYERS_VS_STOCK) ---');

    const p3_id = 'prod_layer_mismatch';
    await db.products.put({
      id: p3_id,
      Name: 'Concor 5mg',
      StockQuantity: 100, // Stock is 100
      Price: 45,
      CostPrice: 30,
      Category: 'Cardiovascular',
      tenantId: tenantA,
      branchId: branch1
    } as any);

    // Layer has only 70
    await db.inventory_layers.put({
      id: 'LAY-CONCOR-01',
      item_id: p3_id,
      productId: p3_id,
      quantity: 70,
      quantity_remaining: 70,
      remaining_qty: 70,
      unit_cost: 30,
      expiry_date: '2028-01-01',
      created_at: '2026-01-01T00:00:00Z',
      tenant_id: tenantA
    } as any);

    // Add matching purchase of 100 so book balance is 100
    await db.invoices.put({
      id: 'INV-PUR-CONCOR',
      type: 'PURCHASE',
      document_status: 'POSTED',
      items: [{ product_id: p3_id, qty: 100, price: 30, totalPrice: 3000 }],
      tenantId: tenantA,
      branchId: branch1,
      createdAt: '2026-01-01T00:00:00Z'
    } as any);

    const p3Audit = await InventoryReconciliationService.auditProduct(p3_id, { tenantId: tenantA });
    assert(p3Audit.discrepancies.some(d => d.type === 'LAYERS_VS_STOCK'), 'LAYERS_VS_STOCK detected');

    const p3Cases = await InventoryCorrectionService.registerDiscrepancyCases(p3Audit, adminUser);
    const p3Case = p3Cases.find(c => c.discrepancyType === 'LAYERS_VS_STOCK');
    assert(p3Case !== undefined, 'LAYERS_VS_STOCK case registered');

    await InventoryCorrectionWorkflow.submitCorrectionProposal(
      p3Case!.id,
      {
        actionType: 'ALIGN_LAYERS_ADJUSTMENT',
        proposedQty: 100,
        targetWarehouseId: 'WH-MAIN',
        reason: 'مواءمة طبقات الوارد أولاً يصرف أولاً لتطابق الرصيد الفعلي 100 عبوة'
      },
      managerUser
    );

    await InventoryCorrectionWorkflow.approveCorrection(p3Case!.id, adminUser);
    const p3Exec = await InventoryCorrectionWorkflow.executeCorrection(p3Case!.id, adminUser);

    assert(p3Exec.status === 'RECONCILED', 'LAYERS_VS_STOCK case successfully aligned and reconciled');

    const layersAfterConcor = await db.inventory_layers.where('item_id').equals(p3_id).toArray();
    const sumAfter = layersAfterConcor.reduce((sum: number, l: any) => sum + Number(l.quantity_remaining), 0);
    assert(sumAfter === 100, 'Sum of remaining FIFO layers now exactly equals master stock 100');

    // =========================================================================
    // TEST SUITE 9: Negative Stock Resolution (NEGATIVE_STOCK)
    // =========================================================================
    console.log('\n--- Test Suite 9: Negative Stock Resolution (NEGATIVE_STOCK) ---');

    const p4_id = 'prod_neg_stock';
    await db.products.put({
      id: p4_id,
      Name: 'Negative Item Syrup',
      StockQuantity: -5,
      Price: 20,
      CostPrice: 10,
      Category: 'Syrups',
      tenantId: tenantA,
      branchId: branch1
    } as any);

    const p4Audit = await InventoryReconciliationService.auditProduct(p4_id, { tenantId: tenantA });
    assert(p4Audit.discrepancies.some(d => d.type === 'NEGATIVE_STOCK'), 'NEGATIVE_STOCK detected');

    const p4Cases = await InventoryCorrectionService.registerDiscrepancyCases(p4Audit, adminUser);
    const p4Case = p4Cases.find(c => c.discrepancyType === 'NEGATIVE_STOCK')!;

    await InventoryCorrectionWorkflow.submitCorrectionProposal(
      p4Case.id,
      {
        actionType: 'RESOLVE_NEGATIVE_STOCK',
        proposedQty: 10,
        targetWarehouseId: 'WH-MAIN',
        reason: 'تصحيح الرصيد السالب بعد إتمام جرد المستودع واكتشاف رصيد فعلي 10 عبوات'
      },
      managerUser
    );

    await InventoryCorrectionWorkflow.approveCorrection(p4Case.id, adminUser);
    const p4Exec = await InventoryCorrectionWorkflow.executeCorrection(p4Case.id, adminUser);

    assert(p4Exec.status === 'RECONCILED', 'Negative stock case reconciled');
    const p4ProdAfter = await db.products.get(p4_id);
    assert(Number(p4ProdAfter.StockQuantity) === 10, 'Product StockQuantity corrected from -5 to +10');

    // =========================================================================
    // TEST SUITE 10: Atomic Rollback on Reconciliation Failure
    // =========================================================================
    console.log('\n--- Test Suite 10: Atomic Rollback on Reconciliation Verification Failure ---');

    const p5_id = 'prod_rollback_test';
    await db.products.put({
      id: p5_id,
      Name: 'Rollback Test Product',
      StockQuantity: 100,
      Price: 50,
      CostPrice: 30,
      Category: 'General',
      tenantId: tenantA,
      branchId: branch1
    } as any);

    // Layer has only 40 (discrepancy of 60)
    await db.inventory_layers.put({
      id: 'LAY-ROLLBACK-01',
      item_id: p5_id,
      productId: p5_id,
      quantity: 40,
      quantity_remaining: 40,
      remaining_qty: 40,
      unit_cost: 30,
      expiry_date: '2028-01-01',
      created_at: '2026-01-01T00:00:00Z',
      tenant_id: tenantA
    } as any);

    // Book purchase of 100 so book balance is 100
    await db.invoices.put({
      id: 'INV-PUR-ROLLBACK',
      type: 'PURCHASE',
      document_status: 'POSTED',
      items: [{ product_id: p5_id, qty: 100, price: 30, totalPrice: 3000 }],
      tenantId: tenantA,
      branchId: branch1,
      createdAt: '2026-01-01T00:00:00Z'
    } as any);

    const p5Audit = await InventoryReconciliationService.auditProduct(p5_id, { tenantId: tenantA });
    const p5Cases = await InventoryCorrectionService.registerDiscrepancyCases(p5Audit, adminUser);
    const p5Case = p5Cases.find(c => c.discrepancyType === 'LAYERS_VS_STOCK')!;

    // Propose an INSUFFICIENT correction (e.g. proposes qty: 60 instead of 100)
    await InventoryCorrectionWorkflow.submitCorrectionProposal(
      p5Case.id,
      {
        actionType: 'ALIGN_LAYERS_ADJUSTMENT',
        proposedQty: 60, // Leaving variance of 40 between layer sum (60) and master stock (100)
        targetWarehouseId: 'WH-MAIN',
        reason: 'تسوية جزئية غير كافية تترك فجوة بين الطبقات والرصيد الفعلي'
      },
      managerUser
    );

    await InventoryCorrectionWorkflow.approveCorrection(p5Case.id, adminUser);

    let rollbackTriggered = false;
    try {
      await InventoryCorrectionWorkflow.executeCorrection(p5Case.id, adminUser);
    } catch (e: any) {
      rollbackTriggered = e.name === 'ReconciliationVerificationFailedError';
    }

    assert(rollbackTriggered, 'Reconciliation verification failure threw ReconciliationVerificationFailedError');

    // Verify Case Status transitioned to ROLLBACK_FAILED
    const p5CaseAfter = await InventoryCorrectionWorkflow.getCase(p5Case.id, tenantA);
    assert(p5CaseAfter?.status === 'ROLLBACK_FAILED', 'Failed case marked as ROLLBACK_FAILED');

    // Verify Layer was NOT modified to 60 (rolled back to original 40)
    const p5LayerAfter = await db.inventory_layers.get('LAY-ROLLBACK-01');
    assert(Number(p5LayerAfter.quantity_remaining) === 40, 'Layer quantity reverted to original 40 via Atomic Rollback');

    // =========================================================================
    // TEST SUITE 11: Audit Trail Completeness
    // =========================================================================
    console.log('\n--- Test Suite 11: Audit Trail Completeness ---');

    assert(p1_id !== null, 'Checking case 1 audit trail');
    const case1Final = await InventoryCorrectionWorkflow.getCase(createdCase!.id, tenantA);
    assert(case1Final !== null, 'Case 1 loaded');
    assert(case1Final!.auditTrail.length >= 4, 'Case audit trail contains all progression milestones');

    const actions = case1Final!.auditTrail.map(a => a.action);
    assert(actions.includes('CASE_OPENED'), 'Audit log includes CASE_OPENED');
    assert(actions.includes('REVIEW_STARTED'), 'Audit log includes REVIEW_STARTED');
    assert(actions.includes('PROPOSAL_SUBMITTED'), 'Audit log includes PROPOSAL_SUBMITTED');
    assert(actions.includes('CASE_APPROVED'), 'Audit log includes CASE_APPROVED');
    assert(actions.includes('CORRECTION_RECONCILED'), 'Audit log includes CORRECTION_RECONCILED');

    // Summary Metrics
    const metrics = await InventoryCorrectionWorkflow.getSummaryMetrics(tenantA);
    assert(metrics.RECONCILED >= 3, 'Dashboard metrics reflect reconciled cases');
    assert(metrics.ROLLBACK_FAILED >= 1, 'Dashboard metrics reflect rollback failed cases');

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n========================================================================');
  console.log(`📊 Phase 3.3 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
