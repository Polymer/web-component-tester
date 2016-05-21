declare module 'findup-sync' {
	import minimatch = require('minimatch');

	interface IOptions extends minimatch.Options {
		cwd?: string;
	}

	function mod(pattern: string[] | string, opts?: IOptions): string;
	namespace mod {

	}
	export = mod;
}
