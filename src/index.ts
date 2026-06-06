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

async function settingValue(name: string): Promise<string> {
	const value = await joplin.settings.value(name);
	return String(value || '').trim();
}

async function currentNote(): Promise<any> {
	const note = await joplin.workspace.selectedNote();
	if (!note) throw new Error('Không có note nào đang được chọn.');
	return note;
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
			name: 'joplinGptRewriteNote',
			label: 'GPT: Viết lại note rõ hơn',
			execute: async () => runNoteAction('GPT Rewrite', 'Hãy viết lại note này rõ ràng, có cấu trúc hơn, không thêm thông tin không có trong note.'),
		});

		await joplin.views.menuItems.create('joplinGptOpenSettingsMenu', 'joplinGptOpenSettings', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('joplinGptOpenSettingsNoteMenu', 'joplinGptOpenSettings', MenuItemLocation.Note);
		await joplin.views.menuItems.create('joplinGptSummarizeNoteMenu', 'joplinGptSummarizeNote', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('joplinGptRewriteNoteMenu', 'joplinGptRewriteNote', MenuItemLocation.Tools);
		await joplin.views.toolbarButtons.create('joplinGptOpenSettingsToolbar', 'joplinGptOpenSettings', ToolbarButtonLocation.NoteToolbar);
		await joplin.views.toolbarButtons.create('joplinGptSummarizeNoteToolbar', 'joplinGptSummarizeNote', ToolbarButtonLocation.NoteToolbar);

		const isConfigured = Boolean(await joplin.settings.value(settings.isConfigured));
		if (!isConfigured) {
			setTimeout(() => {
				void openSettingsDialog();
			}, 1500);
		}
	},
});
