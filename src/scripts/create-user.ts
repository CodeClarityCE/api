import { isEmail } from "class-validator";
import type { DataSource, EntityManager } from "typeorm";

import { hashPassword } from "../base_modules/auth/password";
import {
  MemberRole,
  OrganizationMemberships,
} from "../base_modules/organizations/memberships/organization.memberships.entity";
import { Organization } from "../base_modules/organizations/organization.entity";
import { User } from "../base_modules/users/users.entity";
import { CodeClarityLogger } from "../services/logger.service";

import { runScript, withCodeClarity } from "./run-script";

import "reflect-metadata";

const logger = CodeClarityLogger.forService("create-user");

export type Outcome = "created" | "unchanged" | "password reset";

export interface NewUser {
  email: string;
  password: string;
  name: string;
  // Replace the password of a user who already exists.
  resetPassword?: boolean;
}

// Splits "Jane Q Roe" into first "Jane Q" and last "Roe", within signup's limits.
export function splitName(name: string): { first: string; last: string } {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? (words.pop() ?? "") : "";
  const first = words.join(" ");
  if (!first || !last) {
    throw new Error(
      `name must be a first and a last name, like "Jane Roe" (got "${name}")`,
    );
  }
  if (first.length > 25)
    throw new Error("first name must be 1 to 25 characters");
  if (last.length > 50) throw new Error("last name must be 1 to 50 characters");
  return { first, last };
}

// A free handle from the name, padded to the 5 characters signup requires.
async function freeHandle(
  manager: EntityManager,
  first: string,
  last: string,
): Promise<string> {
  const letters = `${first}${last}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 45);
  const base = letters.length >= 5 ? letters : `${letters}User`.padEnd(5, "0");
  let handle = base;
  for (let n = 2; await manager.existsBy(User, { handle }); n++) {
    handle = `${base}${n}`;
  }
  return handle;
}

// Creates a verified user who owns a personal organization, like a confirmed signup.
export async function createUser(
  dataSource: DataSource,
  input: NewUser,
): Promise<Outcome> {
  const { first, last } = splitName(input.name);
  const password = await hashPassword(input.password);

  return dataSource.transaction(async (manager) => {
    const existing = await manager.findOneBy(User, { email: input.email });
    if (existing) {
      if (!input.resetPassword) return "unchanged";
      await manager.update(User, existing.id, { password });
      return "password reset";
    }
    const handle = await freeHandle(manager, first, last);

    const organization = new Organization();
    organization.name = `${handle}'s Org`;
    organization.description = `${last} ${first}'s Personal Organization`;
    organization.created_on = new Date();
    organization.personal = true;
    organization.color_scheme = "1";
    await manager.save(organization);

    const user = new User();
    user.first_name = first;
    user.last_name = last;
    user.email = input.email;
    user.handle = handle;
    user.password = password;
    user.social = false;
    user.setup_done = true;
    user.activated = true;
    user.registration_verified = true;
    user.created_on = new Date();
    user.default_org = organization;
    await manager.save(user);

    organization.created_by = user;
    organization.owners = [user];
    await manager.save(organization);

    const membership = new OrganizationMemberships();
    membership.organization = organization;
    membership.user = user;
    membership.role = MemberRole.OWNER;
    membership.joined_on = new Date();
    await manager.save(membership);
    return "created";
  });
}

const VALUE_FLAGS = {
  "--email": "email",
  "--password": "password",
  "--name": "name",
} as const;

// Reads the account from flags, then CREATE_USER_* variables, and checks it like signup does.
export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined>,
): Required<NewUser> {
  const given: Partial<Record<"email" | "password" | "name", string>> = {};
  let resetPassword = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] ?? "";
    if (flag === "--reset-password") {
      resetPassword = true;
    } else if (flag in VALUE_FLAGS) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      given[VALUE_FLAGS[flag as keyof typeof VALUE_FLAGS]] = value;
    } else {
      throw new Error(`Unknown option ${flag}`);
    }
  }

  const email = given.email ?? env["CREATE_USER_EMAIL"];
  const password = given.password ?? env["CREATE_USER_PASSWORD"];
  const name = (given.name ?? env["CREATE_USER_NAME"])?.trim();
  if (!email) throw new Error("email is required");
  if (!isEmail(email)) throw new Error(`email ${email} is not a valid address`);
  if (!password || password.length < 10 || password.length > 75) {
    throw new Error("password must be 10 to 75 characters");
  }
  if (!name) throw new Error("name is required");
  splitName(name);
  return { email, password, name, resetPassword };
}

async function main(): Promise<void> {
  const input = parseArgs(process.argv.slice(2), process.env);
  const outcome = await withCodeClarity((dataSource) =>
    createUser(dataSource, input),
  );
  logger.log(`User ${input.email}: ${outcome}`, {
    email: input.email,
    outcome,
  });
}

runScript(module, "create-user", main);
