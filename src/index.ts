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
				public: false,
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

		await joplin.views.menuItems.create('joplinGptSummarizeNoteMenu', 'joplinGptSummarizeNote', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('joplinGptRewriteNoteMenu', 'joplinGptRewriteNote', MenuItemLocation.Tools);
		await joplin.views.toolbarButtons.create('joplinGptSummarizeNoteToolbar', 'joplinGptSummarizeNote', ToolbarButtonLocation.NoteToolbar);
	},
});
