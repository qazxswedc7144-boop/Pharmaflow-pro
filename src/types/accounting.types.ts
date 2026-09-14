// src/types/accounting.types.ts
import { 
  Account as DomainAccount, 
  AccountType as DomainAccountType, 
  JournalLine as DomainJournalLine, 
  JournalEntry as DomainJournalEntry, 
  LedgerEntry as DomainLedgerEntry, 
  AccountingPeriod as DomainAccountingPeriod 
} from "../domain";

export type AccountType = DomainAccountType;
export type Account = DomainAccount;
export type JournalLine = DomainJournalLine;
export type AccountingEntry = DomainJournalEntry;
export type PartnerLedgerEntry = DomainLedgerEntry;
export type AccountingPeriod = DomainAccountingPeriod;
