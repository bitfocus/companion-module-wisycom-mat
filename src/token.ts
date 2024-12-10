export class Token {
	#token: number

	constructor(val: number) {
		this.#token = Math.round(val)
		this.#token = this.#token > 254 ? 254 : this.#token < 0 ? 0 : this.#token
	}

	public get currentToken(): number {
		return this.#token
	}

	public get newToken(): number {
		return (this.#token = this.#token >= 254 ? 0 : this.#token + 1)
	}

	public get resetToken(): number {
		return (this.#token = 0)
	}

	public set setToken(val: number) {
		this.#token = Math.round(val)
		this.#token = this.#token > 254 ? 254 : this.#token < 0 ? 0 : this.#token
	}
}
