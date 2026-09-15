// src/features/purchases/components/SmartImportModal.tsx
import React from 'react';
import { 
  ImportAnalysisResult, 
  ExtractedImportRow 
} from '../services/smartImport/types';
import { Product, Supplier } from '@/types';
import { SmartImportProcessingCenter } from './smartImport/SmartImportProcessingCenter';
import { CanonicalResolutionResult } from '../services/smartImport/batchProcessing/types';

export interface SmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  analysisResult: ImportAnalysisResult | null;
  isLoading: boolean;
  progressStage?: string;
  progressPercent?: number;
  progressMessage?: string;
  onApply: (approvedRows: ExtractedImportRow[], supplierName?: string, invoiceNumber?: string, date?: string, canonicalResult?: CanonicalResolutionResult) => void;
  onApplyAndSaveImmediately?: (approvedRows: ExtractedImportRow[], supplierName?: string, invoiceNumber?: string, date?: string, canonicalResult?: CanonicalResolutionResult) => void;
  availableProducts?: Product[];
  availableSuppliers?: Supplier[];
}

export const SmartImportModal: React.FC<SmartImportModalProps> = ({
  isOpen,
  onClose,
  onCancel,
  analysisResult,
  isLoading,
  progressStage,
  progressPercent,
  progressMessage,
  onApply,
  onApplyAndSaveImmediately,
  availableProducts = [],
  availableSuppliers = []
}) => {
  return (
    <SmartImportProcessingCenter
      isOpen={isOpen}
      onClose={onClose}
      onCancel={onCancel}
      analysisResult={analysisResult}
      isLoading={isLoading}
      progressStage={progressStage}
      progressPercent={progressPercent}
      progressMessage={progressMessage}
      onApply={onApply}
      onApplyAndSaveImmediately={onApplyAndSaveImmediately}
      availableProducts={availableProducts}
      availableSuppliers={availableSuppliers}
    />
  );
};
