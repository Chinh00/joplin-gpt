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
	apiKey: 'joplinGptAssistant.apiKey',
	baseUrl: 'joplinGptAssistant.baseUrl',
	model: 'joplinGptAssistant.model',
	systemPrompt: 'joplinGptAssistant.systemPrompt',
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
	const apiKey = await settingValue(settings.apiKey);
	const baseUrl = stripTrailingSlash(await settingValue(settings.baseUrl));
	const model = await settingValue(settings.model);

	if (!apiKey) throw new Error('Bạn chưa cấu hình OpenAI API key trong Joplin settings.');
	if (!baseUrl) throw new Error('Bạn chưa cấu hình API base URL.');
	if (!model) throw new Error('Bạn chưa cấu hình model.');

	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
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
			[settings.apiKey]: {
				value: '',
				type: SettingItemType.String,
				section: settingSection,
				public: false,
				secure: true,
				label: 'API key',
				description: 'OpenAI hoặc API key từ provider tương thích OpenAI.',
			},
			[settings.baseUrl]: {
				value: 'https://api.openai.com/v1',
				type: SettingItemType.String,
				section: settingSection,
				public: true,
				label: 'API base URL',
				description: 'Ví dụ: https://api.openai.com/v1 hoặc endpoint OpenAI-compatible khác.',
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
