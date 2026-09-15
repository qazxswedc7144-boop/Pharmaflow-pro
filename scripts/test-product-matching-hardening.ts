/**
 * Test Suite: Product Matching Engine & Index Hardening
 * Verifies strict 5-tier matching, Arabic/English normalization, dosage safety,
 * close candidate review handling, and weak fuzzy rejection.
 */

import { Product } from '../src/types';
import { ProductMatchingIndex } from '../src/features/purchases/services/smartImport/performance/matchingIndex';
import { ProductMatchingEngine } from '../src/features/purchases/services/smartImport/productMatchingEngine';
import { ExtractedImportRow } from '../src/features/purchases/services/smartImport/types';
import { AliasNormalization } from '../src/features/purchases/services/smartImport/aliasLearning/aliasNormalization';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\x1b[31m✖ FAIL: ${message}\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${message}`);
  }
}

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 PharmaFlow PRO ERP — Product Matching Engine Hardening Suite');
  console.log('======================================================================');

  const catalogProducts: Product[] = [
    {
      id: 'prod-001',
      name: 'Augmentin 1000mg Tab',
      barcode: '6281001001',
      sku: 'AUG-1000',
      price: 50,
      cost: 40,
      stock: 100,
      min_stock: 10,
      category_id: 'cat-1',
      Is_Active: true
    },
    {
      id: 'prod-002',
      name: 'Augmentin 500mg Tab',
      barcode: '6281001002',
      sku: 'AUG-500',
      price: 35,
      cost: 25,
      stock: 50,
      min_stock: 10,
      category_id: 'cat-1',
      Is_Active: true
    },
    {
      id: 'prod-003',
      name: 'بنادول إكسترا 500 ملجم أقراص',
      barcode: '6281002001',
      sku: 'PAN-EXT',
      price: 15,
      cost: 10,
      stock: 200,
      min_stock: 20,
      category_id: 'cat-1',
      Is_Active: true
    },
    {
      id: 'prod-004',
      name: 'بنادول أكتيفاست 500 ملجم أقراص',
      barcode: '6281002002',
      sku: 'PAN-ACT',
      price: 18,
      cost: 12,
      stock: 150,
      min_stock: 20,
      category_id: 'cat-1',
      Is_Active: true
    },
    {
      id: 'prod-005',
      name: 'Brufen 400mg Syrup',
      barcode: '6281003001',
      sku: 'BRU-SYR',
      price: 20,
      cost: 15,
      stock: 80,
      min_stock: 10,
      category_id: 'cat-1',
      Is_Active: true
    },
    {
      id: 'prod-006',
      name: 'Brufen 400mg Tab',
      barcode: '6281003002',
      sku: 'BRU-TAB',
      price: 22,
      cost: 16,
      stock: 120,
      min_stock: 15,
      category_id: 'cat-1',
      Is_Active: true
    }
  ];

  const index = new ProductMatchingIndex(catalogProducts);

  // -------------------------------------------------------------------------
  console.log('\n🔹 Test Suite 1: Tier 1 - Barcode & Product Code Priority');
  // -------------------------------------------------------------------------
  {
    // Even if name is completely scrambled or different, barcode matches!
    const row1: ExtractedImportRow = {
      rowIndex: 1,
      rawText: 'Item X 6281001001',
      productName: 'Unknown Medication Name',
      barcode: '6281001001',
      status: 'VALID',
      validationIssues: []
    };
    const res1 = index.matchRow(row1);
    assert(res1 !== null && res1.matchType === 'BARCODE' && res1.product.id === 'prod-001', 'Matches by Barcode with Tier 1 priority');

    // Code / SKU Match
    const row2: ExtractedImportRow = {
      rowIndex: 2,
      rawText: 'Item Y AUG-500',
      productName: 'Different Name',
      productCode: 'AUG-500',
      status: 'VALID',
      validationIssues: []
    };
    const res2 = index.matchRow(row2);
    assert(res2 !== null && res2.matchType === 'CODE' && res2.product.id === 'prod-002', 'Matches by Product SKU/Code with Tier 1 priority');
  }

  // -------------------------------------------------------------------------
  console.log('\n🔹 Test Suite 2: Tier 2 - Arabic & English Normalization & Canonical Matching');
  // -------------------------------------------------------------------------
  {
    // Arabic tashkeel, hamza, taa marbuta, Eastern Arabic digits
    const row: ExtractedImportRow = {
      rowIndex: 3,
      rawText: 'بَنَادُول اكسترا ٥٠٠ ملجم اقراص',
      productName: 'بَنَادُول اكسترا ٥٠٠ ملجم اقراص',
      status: 'VALID',
      validationIssues: []
    };
    const res = index.matchRow(row);
    assert(res !== null && (res.matchType === 'NORMALIZED' || res.matchType === 'EXACT') && res.product.id === 'prod-003',
      'Matches Arabic text with tashkeel, hamza variations, taa marbuta, and Hindi digits (٥٠٠ -> 500)');

    // Canonical strength 1g -> 1000mg
    const rowGram: ExtractedImportRow = {
      rowIndex: 4,
      rawText: 'Augmentin 1g Tab',
      productName: 'Augmentin 1g Tab',
      status: 'VALID',
      validationIssues: []
    };
    const resGram = index.matchRow(rowGram);
    assert(resGram !== null && (resGram.matchType === 'NORMALIZED' || resGram.matchType === 'EXACT') && resGram.product.id === 'prod-001',
      'Canonicalizes 1g to 1000mg and matches Augmentin 1000mg Tab');
  }

  // -------------------------------------------------------------------------
  console.log('\n🔹 Test Suite 3: Tier 3 - Learned Aliases');
  // -------------------------------------------------------------------------
  {
    const learnedAliases = {
      'اوجمنتين الف': 'prod-001'
    };
    const rowAlias: ExtractedImportRow = {
      rowIndex: 5,
      rawText: 'اوجمنتين الف',
      productName: 'اوجمنتين الف',
      status: 'VALID',
      validationIssues: []
    };
    const resAlias = index.matchRow(rowAlias, learnedAliases);
    assert(resAlias !== null && resAlias.matchType === 'ALIAS' && resAlias.product.id === 'prod-001',
      'Matches product correctly via learned alias dictionary');
  }

  // -------------------------------------------------------------------------
  console.log('\n🔹 Test Suite 4: Pharmaceutical Safety Guards (Dosage & Form Protection)');
  // -------------------------------------------------------------------------
  {
    // Augmentin 500mg must NEVER match Augmentin 1000mg
    const rowDosageMismatch: ExtractedImportRow = {
      rowIndex: 6,
      rawText: 'Augmentin 250mg Tab',
      productName: 'Augmentin 250mg Tab', // Catalog only has 500mg and 1000mg
      status: 'VALID',
      validationIssues: []
    };
    const resDosageMismatch = index.matchRow(rowDosageMismatch);
    assert(resDosageMismatch === null, 'Rejects dangerous dosage match (Augmentin 250mg vs 500mg/1000mg catalog entries)');

    // Brufen Tablet must NEVER match Brufen Syrup
    const rowFormMismatch: ExtractedImportRow = {
      rowIndex: 7,
      rawText: 'Brufen 400mg Drops', // Catalog only has Syrup and Tab
      productName: 'Brufen 400mg Drops',
      status: 'VALID',
      validationIssues: []
    };
    const resFormMismatch = index.matchRow(rowFormMismatch);
    assert(resFormMismatch === null, 'Rejects dangerous form match (Drops vs Tab/Syrup)');
  }

  // -------------------------------------------------------------------------
  console.log('\n🔹 Test Suite 5: Tier 4 Decisive Fuzzy Match & Tier 5 Close Candidates Review');
  // -------------------------------------------------------------------------
  {
    // Decisive fuzzy match (minor OCR typo in Syrup: 'Brufen 400mg Syrp')
    const rowFuzzy: ExtractedImportRow = {
      rowIndex: 8,
      rawText: 'Brufen 400mg Syrp',
      productName: 'Brufen 400mg Syrp',
      status: 'VALID',
      validationIssues: []
    };
    const resFuzzy = index.matchRow(rowFuzzy);
    assert(resFuzzy !== null && resFuzzy.matchType === 'FUZZY' && resFuzzy.product.id === 'prod-005',
      'Accepts strong decisive fuzzy match (Brufen 400mg Syrp -> Brufen 400mg Syrup)');

    // Two close candidates: "بنادول 500 ملجم أقراص" (Matches both Extra and Actifast closely)
    const rowClose: ExtractedImportRow = {
      rowIndex: 9,
      rawText: 'بنادول 500 ملجم أقراص',
      productName: 'بنادول 500 ملجم أقراص',
      status: 'VALID',
      validationIssues: []
    };
    const resClose = index.matchRow(rowClose);
    assert(
      resClose !== null &&
      resClose.matchType === 'MANUAL_REVIEW' &&
      resClose.needsReview === true &&
      Array.isArray(resClose.candidateAlternatives) &&
      resClose.candidateAlternatives.length >= 2,
      'Flags MANUAL_REVIEW when two close candidates exist instead of guessing incorrectly'
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n🔹 Test Suite 6: ProductMatchingEngine.matchAllRows Batch Integration');
  // -------------------------------------------------------------------------
  {
    const rows: ExtractedImportRow[] = [
      {
        rowIndex: 1,
        rawText: 'Augmentin 1000mg Tab',
        productName: 'Augmentin 1000mg Tab',
        status: 'VALID',
        validationIssues: []
      },
      {
        rowIndex: 2,
        rawText: 'بنادول 500 ملجم أقراص',
        productName: 'بنادول 500 ملجم أقراص',
        status: 'VALID',
        validationIssues: []
      },
      {
        rowIndex: 3,
        rawText: 'Unregistered Vitamin C 1000mg',
        productName: 'Unregistered Vitamin C 1000mg',
        status: 'VALID',
        validationIssues: []
      }
    ];

    const matchedRows = ProductMatchingEngine.matchAllRows(rows, catalogProducts);

    // Row 1: Exact match
    assert(matchedRows[0].matchedProductId === 'prod-001' && matchedRows[0].matchType === 'EXACT', 'Row 1 matched cleanly');

    // Row 2: Close candidates -> Needs review with WARNING status
    assert(
      matchedRows[1].needsReview === true &&
      matchedRows[1].matchType === 'MANUAL_REVIEW' &&
      matchedRows[1].status === 'WARNING' &&
      matchedRows[1].candidateAlternatives !== undefined &&
      matchedRows[1].candidateAlternatives.length >= 2,
      'Row 2 flagged with WARNING status and candidate alternatives for manual review'
    );

    // Row 3: Unregistered product -> isNewProductCandidate: true
    assert(
      matchedRows[2].isNewProductCandidate === true &&
      matchedRows[2].matchType === 'NONE',
      'Row 3 correctly flagged as new unregistered product candidate'
    );
  }

  console.log('======================================================================');
  console.log('📊 All Product Matching Engine Hardening Tests Passed Successfully!');
  console.log('======================================================================');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
