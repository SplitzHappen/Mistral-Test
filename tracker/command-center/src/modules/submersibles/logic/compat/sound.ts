let audio: any = null;
export function chime(): void {
	try {
		const A =
			(globalThis as any).AudioContext ||
			(globalThis as any).webkitAudioContext;
		if (!A) return;
		audio = audio || new A();
		if (audio.state === "suspended") audio.resume();
		[
			[880, 0],
			[1320, 0.18],
		].forEach((n) => {
			const o = audio.createOscillator();
			const gg = audio.createGain();
			const t = audio.currentTime + n[1];
			o.frequency.value = n[0];
			o.type = "sine";
			gg.gain.setValueAtTime(0.0001, t);
			gg.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
			gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
			o.connect(gg);
			gg.connect(audio.destination);
			o.start(t);
			o.stop(t + 0.55);
		});
	} catch (_e) {
		/* no sound on this device */
	}
}
export function unlockSound(): void {
	try {
		const A =
			(globalThis as any).AudioContext ||
			(globalThis as any).webkitAudioContext;
		if (A && !audio) audio = new A();
		if (audio && audio.state === "suspended") audio.resume();
	} catch (_e) {
		/* none */
	}
}
