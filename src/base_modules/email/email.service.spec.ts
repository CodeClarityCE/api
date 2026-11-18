import { type ConfigService } from "@nestjs/config";
import { type MailerService } from "@nestjs-modules/mailer";
import Handlebars from "handlebars";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type User } from "src/base_modules/users/users.entity";

import { EmailService } from "./email.service";

const TEMPLATES = join(__dirname, "templates");

// Renders a template the way the mailer does, partials and strict mode included.
function render(template: string, context: Record<string, unknown>): string {
  const handlebars = Handlebars.create();
  for (const file of readdirSync(join(TEMPLATES, "partials"))) {
    handlebars.registerPartial(
      file.replace(/\.hbs$/, ""),
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the test reads its own templates
      readFileSync(join(TEMPLATES, "partials", file), "utf8"),
    );
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the test reads its own templates
  const source = readFileSync(
    join(TEMPLATES, `${template.replace(/^\.\//, "")}.hbs`),
    "utf8",
  );
  return handlebars.compile(source, { strict: true })(context);
}

describe("EmailService invite emails", () => {
  let sendMail: jest.Mock;
  let service: EmailService;
  const inviter = { first_name: "Jane", last_name: "Doe" } as User;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue(undefined);
    const config = {
      getOrThrow: (key: string) =>
        key === "WEB_HOST" ? "https://codeclarity.example" : "CodeClarity",
    } as unknown as ConfigService;
    service = new EmailService(
      { sendMail } as unknown as MailerService,
      config,
    );
  });

  function sentText(): string {
    const [{ template, context }] = sendMail.mock.calls[0] as [
      { template: string; context: Record<string, unknown> },
    ];
    return render(template, context).replace(/\s+/g, " ");
  }

  it("the invite email says the invitation lasts 3 days", async () => {
    await service.sendOrganizationInvite({
      email: "invitee@example.com",
      inviteToken: "token",
      userEmailDigest: "digest",
      organizationName: "Acme",
      inviter,
      orgId: "org-1",
    });

    expect(sentText()).toContain("This invitation is valid for 3 days.");
    expect(sentText()).not.toMatch(/valid for (?!3 days)/);
  });

  it("the invite email for a new user says the invitation lasts 3 days", async () => {
    await service.sendOrganizationInviteForNonUser({
      email: "new@example.com",
      inviteToken: "token",
      userEmailDigest: "digest",
      organizationName: "Acme",
      inviter,
      orgId: "org-1",
    });

    expect(sentText()).toContain("This invitation is valid for 3 days.");
    expect(sentText()).not.toMatch(/valid for (?!3 days)/);
  });

  it("the invite email has a join link and no unsubscribe links", async () => {
    await service.sendOrganizationInvite({
      email: "invitee@example.com",
      inviteToken: "invite-token",
      userEmailDigest: "digest",
      organizationName: "Acme",
      inviter,
      orgId: "org-1",
    });

    expect(sentText()).toContain(
      "https://codeclarity.example/email_action/join_org?token",
    );
    expect(sentText()).not.toContain("/email_action/unsubscribe");
    expect(sentText()).not.toContain("user settings");
  });

  it("the invite email for a new user has a join link and no unsubscribe links", async () => {
    await service.sendOrganizationInviteForNonUser({
      email: "new@example.com",
      inviteToken: "invite-token",
      userEmailDigest: "digest",
      organizationName: "Acme",
      inviter,
      orgId: "org-1",
    });

    expect(sentText()).toContain(
      "https://codeclarity.example/email_action/join_org?token",
    );
    expect(sentText()).not.toContain("/email_action/unsubscribe");
  });
});
