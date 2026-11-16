import { ADVISOR } from "./compat/advisor.ts";
import { g } from "./compat/device.ts";
import { EARN } from "./compat/earn.ts";
import { FLEET } from "./compat/fleet.ts";
import { PUSH } from "./compat/push.ts";
import * as page from "./page.ts";

export function installSubsGlobals(): void {
	g.FLEET = FLEET;
	g.ADVISOR = ADVISOR;
	g.PUSH = PUSH;
	g.EARN = EARN;
}

installSubsGlobals();

export { page };
