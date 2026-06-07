import joplin from 'api';
import { MenuItemLocation, SettingItemType, ToolbarButtonLocation } from 'api/types';

type ChatMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

type ChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
	error?: {
		message?: string;
	};
};

type PanelMessage = {
	type: 'chat';
	prompt: string;
	mode: 'answer' | 'append' | 'replace-selection';
};

const settingSection = 'joplinGptAssistant';
const settings = {
	provider: 'joplinGptAssistant.provider',
	apiKey: 'joplinGptAssistant.apiKey',
	baseUrl: 'joplinGptAssistant.baseUrl',
	nineRouterBaseUrl: 'joplinGptAssistant.nineRouterBaseUrl',
	model: 'joplinGptAssistant.model',
	systemPrompt: 'joplinGptAssistant.systemPrompt',
	isConfigured: 'joplinGptAssistant.isConfigured',
};

const providerValues = {
	openAi: 'openai',
	nineRouter: '9router',
	custom: 'custom',
};

let chatPanel: string | null = null;

async function settingValue(name: string): Promise<string> {
	const value = await joplin.settings.value(name);
	return String(value || '').trim();
}

async function currentNote(): Promise<any> {
	const note = await joplin.workspace.selectedNote();
	if (!note) throw new Error('Không có note nào đang được chọn.');
	return note;
}

async function selectedText(): Promise<string> {
	try {
		const text = await joplin.commands.execute('selectedText');
		return String(text || '').trim();
	} catch (error) {
		return '';
	}
}

async function replaceSelection(text: string): Promise<void> {
	await joplin.commands.execute('replaceSelection', text);
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

async function openSettingsDialog(): Promise<void> {
	const dialog = await joplin.views.dialogs.create('joplinGptAssistantSettingsDialog');
	const provider = await settingValue(settings.provider) || providerValues.openAi;
	const apiKey = await settingValue(settings.apiKey);
	const baseUrl = await settingValue(settings.baseUrl) || 'https://api.openai.com/v1';
	const nineRouterBaseUrl = await settingValue(settings.nineRouterBaseUrl) || 'http://localhost:20128/v1';
	const model = await settingValue(settings.model) || 'gpt-4.1-mini';
	const systemPrompt = await settingValue(settings.systemPrompt) || 'Bạn là trợ lý ghi chú trong Joplin. Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt.';

	await joplin.views.dialogs.setHtml(dialog, `
		<form name="settings">
			<style>
				body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 8px; }
				.field { margin-bottom: 14px; }
				label { display: block; font-weight: 600; margin-bottom: 6px; }
				input, select, textarea { box-sizing: border-box; width: 100%; padding: 8px; }
				textarea { min-height: 90px; resize: vertical; }
				.hint { color: #666; font-size: 12px; margin-top: 4px; }
			</style>
			<h2>Joplin GPT Assistant</h2>
			<div class="field">
				<label for="provider">Provider</label>
				<select id="provider" name="provider">
					<option value="${providerValues.openAi}" ${provider === providerValues.openAi ? 'selected' : ''}>OpenAI</option>
					<option value="${providerValues.nineRouter}" ${provider === providerValues.nineRouter ? 'selected' : ''}>9Router</option>
					<option value="${providerValues.custom}" ${provider === providerValues.custom ? 'selected' : ''}>Custom OpenAI-compatible</option>
				</select>
			</div>
			<div class="field">
				<label for="apiKey">API key</label>
				<input id="apiKey" name="apiKey" type="password" value="${escapeHtml(apiKey)}" placeholder="sk-..." />
				<div class="hint">Có thể để trống nếu dùng 9Router local không bật auth.</div>
			</div>
			<div class="field">
				<label for="baseUrl">API base URL</label>
				<input id="baseUrl" name="baseUrl" type="text" value="${escapeHtml(baseUrl)}" />
				<div class="hint">Dùng cho OpenAI hoặc Custom. Ví dụ: https://api.openai.com/v1</div>
			</div>
			<div class="field">
				<label for="nineRouterBaseUrl">9Router base URL</label>
				<input id="nineRouterBaseUrl" name="nineRouterBaseUrl" type="text" value="${escapeHtml(nineRouterBaseUrl)}" />
				<div class="hint">Mặc định: http://localhost:20128/v1</div>
			</div>
			<div class="field">
				<label for="model">Model</label>
				<input id="model" name="model" type="text" value="${escapeHtml(model)}" placeholder="gpt-4.1-mini" />
			</div>
			<div class="field">
				<label for="systemPrompt">System prompt</label>
				<textarea id="systemPrompt" name="systemPrompt">${escapeHtml(systemPrompt)}</textarea>
			</div>
		</form>
	`);
	await joplin.views.dialogs.setButtons(dialog, [
		{ id: 'submit', title: 'Lưu cấu hình' },
		{ id: 'cancel', title: 'Huỷ' },
	]);

	const result = await joplin.views.dialogs.open(dialog);
	if (result.id !== 'submit') return;

	const formData = result.formData?.settings || {};
	await joplin.settings.setValue(settings.provider, String(formData.provider || providerValues.openAi));
	await joplin.settings.setValue(settings.apiKey, String(formData.apiKey || ''));
	await joplin.settings.setValue(settings.baseUrl, String(formData.baseUrl || 'https://api.openai.com/v1'));
	await joplin.settings.setValue(settings.nineRouterBaseUrl, String(formData.nineRouterBaseUrl || 'http://localhost:20128/v1'));
	await joplin.settings.setValue(settings.model, String(formData.model || 'gpt-4.1-mini'));
	await joplin.settings.setValue(settings.systemPrompt, String(formData.systemPrompt || ''));
	await joplin.settings.setValue(settings.isConfigured, true);
	await joplin.views.dialogs.showMessageBox('Đã lưu cấu hình Joplin GPT Assistant.');
}

async function askGpt(messages: ChatMessage[]): Promise<string> {
	const provider = await settingValue(settings.provider);
	const apiKey = await settingValue(settings.apiKey);
	const baseUrl = stripTrailingSlash(provider === providerValues.nineRouter
		? await settingValue(settings.nineRouterBaseUrl)
		: await settingValue(settings.baseUrl));
	const model = await settingValue(settings.model);

	if (!apiKey && provider !== providerValues.nineRouter) throw new Error('Bạn chưa cấu hình API key trong Joplin settings.');
	if (!baseUrl) throw new Error('Bạn chưa cấu hình API base URL.');
	if (!model) throw new Error('Bạn chưa cấu hình model.');

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};

	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			model,
			messages,
			temperature: 0.3,
		}),
	});

	const data = await response.json() as ChatCompletionResponse;
	if (!response.ok) throw new Error(data.error?.message || `GPT API lỗi HTTP ${response.status}.`);

	const content = data.choices?.[0]?.message?.content?.trim();
	if (!content) throw new Error('GPT API không trả về nội dung.');
	return content;
}

async function appendToCurrentNote(markdown: string): Promise<void> {
	const note = await currentNote();
	const divider = '\n\n---\n\n';
	await joplin.data.put(['notes', note.id], null, {
		body: `${note.body || ''}${divider}${markdown}`,
	});
}

async function buildContextText(): Promise<string> {
	const note = await currentNote();
	const selection = await selectedText();
	return `Tiêu đề note: ${note.title || '(không có tiêu đề)'}\n\nĐoạn đang bôi đen:\n${selection || '(không có đoạn bôi đen)'}\n\nToàn bộ note:\n${note.body || ''}`;
}

async function summarizeSelectionOrNote(): Promise<void> {
	try {
		const note = await currentNote();
		const selection = await selectedText();
		const targetText = selection || note.body || '';
		if (!targetText.trim()) throw new Error('Không có nội dung để tóm tắt.');

		const systemPrompt = await settingValue(settings.systemPrompt);
		const answer = await askGpt([
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: `Hãy tóm tắt nội dung sau thành các ý chính, bằng tiếng Việt:\n\n${targetText}` },
		]);

		if (selection) {
			await replaceSelection(`> GPT Summary\n>\n${answer.split('\n').map(line => `> ${line}`).join('\n')}\n\n${selection}`);
		} else {
			await appendToCurrentNote(`## GPT Summary\n\n${answer}`);
		}
	} catch (error) {
		await joplin.views.dialogs.showMessageBox(`Joplin GPT Assistant: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function editSelectionWithInstruction(instruction: string): Promise<string> {
	const selection = await selectedText();
	if (!selection) throw new Error('Hãy bôi đen đoạn cần chỉnh sửa trước.');

	const systemPrompt = await settingValue(settings.systemPrompt);
	return askGpt([
		{ role: 'system', content: systemPrompt },
		{
			role: 'user',
			content: `${instruction}\n\nChỉ trả về nội dung đã chỉnh sửa, không giải thích thêm.\n\nĐoạn cần chỉnh sửa:\n${selection}`,
		},
	]);
}

async function rewriteSelectedText(): Promise<void> {
	try {
		const answer = await editSelectionWithInstruction('Hãy viết lại đoạn này rõ ràng, mạch lạc hơn, giữ nguyên ý chính.');
		await replaceSelection(answer);
	} catch (error) {
		await joplin.views.dialogs.showMessageBox(`Joplin GPT Assistant: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function runNoteAction(title: string, instruction: string): Promise<void> {
	try {
		const note = await currentNote();
		const systemPrompt = await settingValue(settings.systemPrompt);
		const answer = await askGpt([
			{ role: 'system', content: systemPrompt },
			{
				role: 'user',
				content: `${instruction}\n\nTiêu đề note: ${note.title || '(không có tiêu đề)'}\n\nNội dung note:\n${note.body || ''}`,
			},
		]);

		await appendToCurrentNote(`## ${title}\n\n${answer}`);
		await joplin.views.dialogs.showMessageBox(`Đã thêm mục “${title}” vào note hiện tại.`);
	} catch (error) {
		await joplin.views.dialogs.showMessageBox(`Joplin GPT Assistant: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function chatPanelHtml(): string {
	return `
		<style>
			:root { color-scheme: light dark; }
			body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 12px; }
			.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
			h2 { font-size: 16px; margin: 0; }
			#messages { display: flex; flex-direction: column; gap: 8px; min-height: 220px; max-height: 52vh; overflow: auto; margin-bottom: 10px; }
			.message { border: 1px solid rgba(127,127,127,.25); border-radius: 10px; padding: 9px; white-space: pre-wrap; line-height: 1.4; }
			.user { background: rgba(80, 130, 255, .12); }
			.assistant { background: rgba(127,127,127,.10); }
			textarea, select, button { box-sizing: border-box; width: 100%; }
			textarea { min-height: 90px; resize: vertical; padding: 8px; }
			select { padding: 7px; margin: 8px 0; }
			button { padding: 8px; margin-top: 6px; cursor: pointer; }
			.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
			.hint { font-size: 12px; color: #777; margin-top: 8px; }
		</style>
		<div class="header"><h2>GPT Chat</h2></div>
		<div id="messages"><div class="message assistant">Hỏi về note hiện tại, hoặc bôi đen đoạn trong editor rồi chọn “Thay đoạn bôi đen”.</div></div>
		<textarea id="prompt" placeholder="Ví dụ: sửa đoạn này ngắn gọn hơn, thêm bullet points, giải thích phần này..."></textarea>
		<select id="mode">
			<option value="answer">Chỉ trả lời trong chat</option>
			<option value="append">Thêm câu trả lời vào cuối note</option>
			<option value="replace-selection">Thay đoạn bôi đen</option>
		</select>
		<div class="row">
			<button id="send">Gửi</button>
			<button id="config">Cấu hình</button>
		</div>
		<div class="hint">Mẹo: bôi đen đoạn trong note → chuột phải → GPT: Tóm tắt đoạn bôi đen.</div>
		<script>
			const messages = document.getElementById('messages');
			const promptInput = document.getElementById('prompt');
			function addMessage(role, text) {
				const item = document.createElement('div');
				item.className = 'message ' + role;
				item.textContent = text;
				messages.appendChild(item);
				messages.scrollTop = messages.scrollHeight;
			}
			document.getElementById('send').addEventListener('click', async () => {
				const prompt = promptInput.value.trim();
				if (!prompt) return;
				const mode = document.getElementById('mode').value;
				addMessage('user', prompt);
				promptInput.value = '';
				addMessage('assistant', 'Đang xử lý...');
				const pending = messages.lastElementChild;
				try {
					const response = await webviewApi.postMessage({ type: 'chat', prompt, mode });
					pending.textContent = response.ok ? response.text : 'Lỗi: ' + response.error;
				} catch (error) {
					pending.textContent = 'Lỗi: ' + String(error);
				}
			});
			document.getElementById('config').addEventListener('click', async () => {
				await webviewApi.postMessage({ type: 'config' });
			});
			promptInput.addEventListener('keydown', (event) => {
				if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') document.getElementById('send').click();
			});
		</script>
	`;
}

async function ensureChatPanel(): Promise<string> {
	if (chatPanel) return chatPanel;

	chatPanel = await joplin.views.panels.create('joplinGptAssistantChatPanel');
	await joplin.views.panels.setHtml(chatPanel, chatPanelHtml());
	await joplin.views.panels.onMessage(chatPanel, async (message: PanelMessage | { type: 'config' }) => {
		try {
			if (message.type === 'config') {
				await openSettingsDialog();
				return { ok: true, text: 'Đã mở cấu hình.' };
			}

			const contextText = await buildContextText();
			const systemPrompt = await settingValue(settings.systemPrompt);
			const answer = await askGpt([
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: `${message.prompt}\n\nNgữ cảnh:\n${contextText}` },
			]);

			if (message.mode === 'append') {
				await appendToCurrentNote(`## GPT Response\n\n${answer}`);
			} else if (message.mode === 'replace-selection') {
				if (!await selectedText()) throw new Error('Hãy bôi đen đoạn cần thay trước khi gửi.');
				await replaceSelection(answer);
			}

			return { ok: true, text: answer };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	return chatPanel;
}

async function showChatPanel(): Promise<void> {
	const panel = await ensureChatPanel();
	await joplin.views.panels.show(panel, true);
}

joplin.plugins.register({
	onStart: async function() {
		await joplin.settings.registerSection(settingSection, {
			label: 'Joplin GPT Assistant',
			iconName: 'fas fa-robot',
		});

		await joplin.settings.registerSettings({
			[settings.provider]: {
				value: providerValues.openAi,
				type: SettingItemType.String,
				section: settingSection,
				public: true,
				label: 'Provider',
				description: 'Chọn OpenAI, 9Router local gateway, hoặc endpoint OpenAI-compatible tuỳ chỉnh.',
				isEnum: true,
				options: {
					[providerValues.openAi]: 'OpenAI',
					[providerValues.nineRouter]: '9Router',
					[providerValues.custom]: 'Custom OpenAI-compatible',
				},
			},
			[settings.apiKey]: {
				value: '',
				type: SettingItemType.String,
				section: settingSection,
				public: true,
				secure: true,
				label: 'API key',
				description: 'OpenAI hoặc provider tương thích OpenAI. Có thể để trống nếu 9Router local không bật auth.',
			},
			[settings.baseUrl]: {
				value: 'https://api.openai.com/v1',
				type: SettingItemType.String,
				section: settingSection,
				public: true,
				label: 'API base URL',
				description: 'Dùng cho OpenAI hoặc Custom OpenAI-compatible endpoint.',
			},
			[settings.nineRouterBaseUrl]: {
				value: 'http://localhost:20128/v1',
				type: SettingItemType.String,
				section: settingSection,
				public: true,
				label: '9Router base URL',
				description: 'Mặc định 9Router local là http://localhost:20128/v1. Có thể đổi sang tunnel/cloud URL nếu bạn bật remote access.',
			},
			[settings.model]: {
				value: 'gpt-4.1-mini',
				type: SettingItemType.String,
				section: settingSection,
				public: true,
				label: 'Model',
				description: 'Tên model chat completions.',
			},
			[settings.systemPrompt]: {
				value: 'Bạn là trợ lý ghi chú trong Joplin. Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt.',
				type: SettingItemType.String,
				section: settingSection,
				public: true,
				label: 'System prompt',
			},
			[settings.isConfigured]: {
				value: false,
				type: SettingItemType.Bool,
				section: settingSection,
				public: false,
				label: 'Configured',
			},
		});

		await joplin.commands.register({
			name: 'joplinGptOpenSettings',
			label: 'GPT: Cấu hình',
			execute: async () => openSettingsDialog(),
		});

		await joplin.commands.register({
			name: 'joplinGptSummarizeNote',
			label: 'GPT: Tóm tắt note',
			execute: async () => runNoteAction('GPT Summary', 'Hãy tóm tắt note này thành các ý chính, giữ lại việc cần làm nếu có.'),
		});

		await joplin.commands.register({
			name: 'joplinGptSummarizeSelection',
			label: 'GPT: Tóm tắt đoạn bôi đen',
			execute: async () => summarizeSelectionOrNote(),
		});

		await joplin.commands.register({
			name: 'joplinGptRewriteSelection',
			label: 'GPT: Viết lại đoạn bôi đen',
			execute: async () => rewriteSelectedText(),
		});

		await joplin.commands.register({
			name: 'joplinGptShowChatPanel',
			label: 'GPT: Mở chatbot bên phải',
			execute: async () => showChatPanel(),
		});

		await joplin.commands.register({
			name: 'joplinGptRewriteNote',
			label: 'GPT: Viết lại note rõ hơn',
			execute: async () => runNoteAction('GPT Rewrite', 'Hãy viết lại note này rõ ràng, có cấu trúc hơn, không thêm thông tin không có trong note.'),
		});

		await joplin.views.menuItems.create('joplinGptOpenSettingsMenu', 'joplinGptOpenSettings', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('joplinGptOpenSettingsNoteMenu', 'joplinGptOpenSettings', MenuItemLocation.Note);
		await joplin.views.menuItems.create('joplinGptShowChatPanelMenu', 'joplinGptShowChatPanel', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('joplinGptSummarizeNoteMenu', 'joplinGptSummarizeNote', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('joplinGptRewriteNoteMenu', 'joplinGptRewriteNote', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('joplinGptSummarizeSelectionContextMenu', 'joplinGptSummarizeSelection', MenuItemLocation.EditorContextMenu);
		await joplin.views.menuItems.create('joplinGptRewriteSelectionContextMenu', 'joplinGptRewriteSelection', MenuItemLocation.EditorContextMenu);
		await joplin.views.toolbarButtons.create('joplinGptOpenSettingsToolbar', 'joplinGptOpenSettings', ToolbarButtonLocation.NoteToolbar);
		await joplin.views.toolbarButtons.create('joplinGptSummarizeNoteToolbar', 'joplinGptSummarizeNote', ToolbarButtonLocation.NoteToolbar);
		await joplin.views.toolbarButtons.create('joplinGptChatPanelToolbar', 'joplinGptShowChatPanel', ToolbarButtonLocation.NoteToolbar);

		await showChatPanel();

		const isConfigured = Boolean(await joplin.settings.value(settings.isConfigured));
		if (!isConfigured) {
			setTimeout(() => {
				void openSettingsDialog();
			}, 1500);
		}
	},
});
