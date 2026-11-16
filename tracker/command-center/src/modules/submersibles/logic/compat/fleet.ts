import * as cal from "../calendar.ts";
import * as time from "../time.ts";
import { DEVICE_KEY, device, deviceSubs, setDeviceSubs } from "./device.ts";
import { download } from "./dom.ts";
import { chime, unlockSound } from "./sound.ts";
import { startAlerts } from "./start-alerts.ts";

export const FLEET: Record<string, any> = {};
FLEET.DEVICE_KEY = DEVICE_KEY;
FLEET.parseDuration = time.parseDuration;
FLEET.parseBackAt = time.parseBackAt;
FLEET.localInput = time.localInput;
FLEET.status = time.status;
FLEET.LABEL = time.LABEL;
FLEET.fmtDur = time.fmtDur;
FLEET.fmtClock = time.fmtClock;
FLEET.fleet = time.fleet;
FLEET.summary = time.summary;
FLEET.subLabel = time.subLabel;
FLEET.ics = (o: any) =>
	cal.ics({
		title: o.title,
		at: o.at,
		uid: o.uid,
		note: o.note,
		now: o.now == null ? Date.now() : o.now,
	});
FLEET.fileName = cal.fileName;
FLEET.download = download;
FLEET.newId = (prefix: string) => time.newId(prefix, Math.random);
FLEET.tripId = time.tripId;
FLEET.device = device;
FLEET.deviceSubs = deviceSubs;
FLEET.setDeviceSubs = setDeviceSubs;
FLEET.unlockSound = unlockSound;
FLEET.chime = chime;
FLEET.startAlerts = startAlerts;
