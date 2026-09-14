// src/types/auth.types.ts
import { User as DomainUser, UserRole as DomainUserRole, Permission as DomainPermission } from "../domain";
import { SyncableEntity } from "./common.types";

export type UserRole = DomainUserRole;
export type User = DomainUser;

export interface UserRoleEntry extends SyncableEntity {
  User_Email: string;
  Role_Type: UserRole;
}

export type Permission = DomainPermission;
