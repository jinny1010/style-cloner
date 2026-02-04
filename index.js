import { extension_settings, saveSettingsDebounced } from "../../extensions.js";
import { eventSource, event_types } from "../../../../script.js";

const extensionName = "style-cloner";
const extensionFolderPath = `scripts/extensions/${extensionName}/`;

// 기본 설정
const defaultSettings = {
    apiKey: "",
    model: "gemini-2.5-flash-image",
    referenceImageBase64: "",
    referenceImageMime: "",
    autoApply: true,
    styleStrength: "medium" // low, medium, high
};

// 설정 로드
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    Object.assign(extension_settings[extensionName], {
        ...defaultSettings,
        ...extension_settings[extensionName]
    });
}

// 설정 가져오기 헬퍼
function getSettings() {
    return extension_settings[extensionName];
}

// 이미지를 Base64로 변환
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            const mime = file.type;
            resolve({ base64, mime });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Gemini API로 이미지 생성
async function generateImageWithStyle(prompt) {
    const settings = getSettings();
    
    if (!settings.apiKey) {
        toastr.error("Google API Key를 입력해주세요!", "Style Cloner");
        return null;
    }
    
    if (!settings.referenceImageBase64) {
        toastr.error("참조 이미지를 먼저 업로드해주세요!", "Style Cloner");
        return null;
    }

    // 스타일 강도에 따른 프롬프트 조절
    const strengthPrompts = {
        low: "Use a similar art style to the reference image.",
        medium: "Closely match the art style, coloring, and line quality of the reference image.",
        high: "Exactly replicate the art style, coloring technique, shading, and line quality of the reference image as closely as possible."
    };

    const styleInstruction = strengthPrompts[settings.styleStrength] || strengthPrompts.medium;
    const fullPrompt = `${styleInstruction}\n\nDraw: ${prompt}`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
        
        const payload = {
            contents: [{
                parts: [
                    {
                        inline_data: {
                            mime_type: settings.referenceImageMime,
                            data: settings.referenceImageBase64
                        }
                    },
                    {
                        text: fullPrompt
                    }
                ]
            }],
            generationConfig: {
                responseModalities: ["image", "text"],
                responseMimeType: "image/png"
            }
        };

        console.log("[Style Cloner] Sending request to Gemini...");
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }

        // 응답에서 이미지 추출
        const parts = data.candidates?.[0]?.content?.parts || [];
        
        for (const part of parts) {
            if (part.inline_data) {
                console.log("[Style Cloner] Image generated successfully!");
                return {
                    base64: part.inline_data.data,
                    mime: part.inline_data.mime_type || "image/png"
                };
            }
        }

        // 이미지가 없으면 텍스트 응답 확인
        const textPart = parts.find(p => p.text);
        if (textPart) {
            toastr.warning(`Gemini 응답: ${textPart.text}`, "Style Cloner");
        }
        
        throw new Error("이미지가 생성되지 않았습니다. 모델이나 프롬프트를 확인해주세요.");

    } catch (error) {
        console.error("[Style Cloner] Error:", error);
        toastr.error(`생성 실패: ${error.message}`, "Style Cloner");
        return null;
    }
}

// 생성된 이미지를 채팅에 표시
function displayGeneratedImage(imageData, prompt) {
    const imgSrc = `data:${imageData.mime};base64,${imageData.base64}`;
    
    // 결과 영역에 표시
    const resultImg = document.getElementById('style_cloner_result_img');
    if (resultImg) {
        resultImg.src = imgSrc;
        resultImg.style.display = 'block';
    }

    // 다운로드 링크 활성화
    const downloadBtn = document.getElementById('style_cloner_download');
    if (downloadBtn) {
        downloadBtn.href = imgSrc;
        downloadBtn.download = `style_cloner_${Date.now()}.png`;
        downloadBtn.style.display = 'inline-block';
    }
}

// 설정 UI 생성
function createSettingsHtml() {
    const settings = getSettings();
    
    return `
    <div id="style_cloner_settings" class="style-cloner-container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🎨 Style Cloner</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <!-- API Key -->
                <div class="style-cloner-section">
                    <label>Google AI Studio API Key</label>
                    <input type="password" id="style_cloner_api_key" class="text_pole" 
                           placeholder="API 키 입력..." value="${settings.apiKey || ''}">
                </div>

                <!-- Model Selection -->
                <div class="style-cloner-section">
                    <label>모델 선택</label>
                    <select id="style_cloner_model" class="text_pole">
                        <option value="gemini-2.5-flash-image" ${settings.model === 'gemini-2.5-flash-image' ? 'selected' : ''}>Gemini 2.5 Flash Image (Nano Banana)</option>
                        <option value="gemini-3-pro-image-preview" ${settings.model === 'gemini-3-pro-image-preview' ? 'selected' : ''}>Gemini 3 Pro Image (Nano Banana Pro)</option>
                    </select>
                </div>

                <!-- Style Strength -->
                <div class="style-cloner-section">
                    <label>스타일 적용 강도</label>
                    <select id="style_cloner_strength" class="text_pole">
                        <option value="low" ${settings.styleStrength === 'low' ? 'selected' : ''}>약하게</option>
                        <option value="medium" ${settings.styleStrength === 'medium' ? 'selected' : ''}>보통</option>
                        <option value="high" ${settings.styleStrength === 'high' ? 'selected' : ''}>강하게</option>
                    </select>
                </div>

                <!-- Reference Image Upload -->
                <div class="style-cloner-section">
                    <label>참조 이미지 (스타일 원본)</label>
                    <input type="file" id="style_cloner_ref_upload" accept="image/*">
                    <div id="style_cloner_ref_preview_container">
                        <img id="style_cloner_ref_preview" class="style-cloner-preview" 
                             src="${settings.referenceImageBase64 ? `data:${settings.referenceImageMime};base64,${settings.referenceImageBase64}` : ''}"
                             style="${settings.referenceImageBase64 ? '' : 'display:none'}">
                        <button id="style_cloner_clear_ref" class="menu_button" 
                                style="${settings.referenceImageBase64 ? '' : 'display:none'}">참조 이미지 삭제</button>
                    </div>
                </div>

                <hr>

                <!-- Generation Section -->
                <div class="style-cloner-section">
                    <label>생성할 이미지 설명</label>
                    <textarea id="style_cloner_prompt" class="text_pole textarea_compact" 
                              rows="3" placeholder="예: a girl with long black hair, smiling, holding a flower"></textarea>
                    <button id="style_cloner_generate" class="menu_button">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> 이미지 생성
                    </button>
                </div>

                <!-- Result -->
                <div class="style-cloner-section">
                    <label>생성 결과</label>
                    <div id="style_cloner_result_container">
                        <img id="style_cloner_result_img" class="style-cloner-result" style="display:none">
                        <a id="style_cloner_download" class="menu_button" style="display:none">
                            <i class="fa-solid fa-download"></i> 다운로드
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

// 이벤트 리스너 등록
function setupEventListeners() {
    // API Key 저장
    $(document).on('input', '#style_cloner_api_key', function() {
        getSettings().apiKey = $(this).val();
        saveSettingsDebounced();
    });

    // Model 변경
    $(document).on('change', '#style_cloner_model', function() {
        getSettings().model = $(this).val();
        saveSettingsDebounced();
    });

    // Style Strength 변경
    $(document).on('change', '#style_cloner_strength', function() {
        getSettings().styleStrength = $(this).val();
        saveSettingsDebounced();
    });

    // 참조 이미지 업로드
    $(document).on('change', '#style_cloner_ref_upload', async function() {
        const file = this.files[0];
        if (!file) return;

        try {
            const { base64, mime } = await fileToBase64(file);
            const settings = getSettings();
            settings.referenceImageBase64 = base64;
            settings.referenceImageMime = mime;
            saveSettingsDebounced();

            // 미리보기 표시
            $('#style_cloner_ref_preview').attr('src', `data:${mime};base64,${base64}`).show();
            $('#style_cloner_clear_ref').show();
            
            toastr.success("참조 이미지가 저장되었습니다!", "Style Cloner");
        } catch (error) {
            toastr.error("이미지 로드 실패", "Style Cloner");
        }
    });

    // 참조 이미지 삭제
    $(document).on('click', '#style_cloner_clear_ref', function() {
        const settings = getSettings();
        settings.referenceImageBase64 = "";
        settings.referenceImageMime = "";
        saveSettingsDebounced();

        $('#style_cloner_ref_preview').hide();
        $('#style_cloner_clear_ref').hide();
        $('#style_cloner_ref_upload').val('');
        
        toastr.info("참조 이미지가 삭제되었습니다.", "Style Cloner");
    });

    // 이미지 생성
    $(document).on('click', '#style_cloner_generate', async function() {
        const prompt = $('#style_cloner_prompt').val().trim();
        
        if (!prompt) {
            toastr.warning("생성할 이미지 설명을 입력해주세요!", "Style Cloner");
            return;
        }

        const $btn = $(this);
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 생성 중...');

        try {
            const result = await generateImageWithStyle(prompt);
            
            if (result) {
                displayGeneratedImage(result, prompt);
                toastr.success("이미지 생성 완료!", "Style Cloner");
            }
        } finally {
            $btn.prop('disabled', false).html('<i class="fa-solid fa-wand-magic-sparkles"></i> 이미지 생성');
        }
    });
}

// 슬래시 커맨드 등록
function registerSlashCommands() {
    // /stylegen 커맨드
    if (typeof SlashCommandParser !== 'undefined') {
        SlashCommandParser.addCommandObject({
            name: 'stylegen',
            callback: async (args, prompt) => {
                if (!prompt) {
                    return "사용법: /stylegen [이미지 설명]";
                }
                
                const result = await generateImageWithStyle(prompt);
                if (result) {
                    displayGeneratedImage(result, prompt);
                    return "이미지가 생성되었습니다!";
                }
                return "이미지 생성에 실패했습니다.";
            },
            helpString: '참조 스타일로 이미지 생성: /stylegen [설명]'
        });
    }
}

// 초기화
jQuery(async () => {
    await loadSettings();
    
    // UI 추가
    const settingsHtml = createSettingsHtml();
    $('#extensions_settings').append(settingsHtml);
    
    // 이벤트 리스너
    setupEventListeners();
    
    // 슬래시 커맨드
    registerSlashCommands();
    
    console.log("[Style Cloner] Extension loaded!");
});
