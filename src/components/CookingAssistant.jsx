import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Clock, Utensils, CookingPot, ArrowLeft } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import './CookingAssistant.css';

export default function CookingAssistant() {
  const [currentPage, setCurrentPage] = useState('preferences');
  const [formData, setFormData] = useState({
    cookingTime: '30min',
    dishType: 'main course',
    mood: [],
    dietary: [],
    ingredients: '',
    dishName: ''
  });
  
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [progressImage, setProgressImage] = useState(null);
  const [progressImageFile, setProgressImageFile] = useState(null);
  const [isAnalyzingProgress, setIsAnalyzingProgress] = useState(false);
  const [generatedRecipes, setGeneratedRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isHandsFreeMode, setIsHandsFreeMode] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [processingVoiceCommand, setProcessingVoiceCommand] = useState(false);
  const [listeningStatus, setListeningStatus] = useState('idle'); // 'idle', 'listening', 'processing'
  
  const fileInputRef = useRef(null);
  const progressImageInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const genAIRef = useRef(null);
  const handsFreeTimerRef = useRef(null);
  const isProcessingRef = useRef(false);

  const moodOptions = ['spicy', 'comfort food', 'healthy', 'cheesy', 'sour', 'sweet'];
  const dietaryOptions = ['high-protein', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'none'];

  // Initialize Gemini API
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey) {
      genAIRef.current = new GoogleGenAI({ apiKey });
      console.log('Gemini API initialized successfully');
    } else {
      console.error('VITE_GEMINI_API_KEY not found in environment variables');
    }
  }, []);

  // Handle hands-free mode setup and teardown
  useEffect(() => {
    if (isHandsFreeMode) {
      console.log('Starting hands-free mode');
      setupSpeechRecognition(true);
    } else {
      console.log('Stopping hands-free mode');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn('Error stopping recognition:', e);
        }
      }
      if (handsFreeTimerRef.current) {
        clearTimeout(handsFreeTimerRef.current);
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors on cleanup
        }
      }
      if (handsFreeTimerRef.current) {
        clearTimeout(handsFreeTimerRef.current);
      }
    };
  }, [isHandsFreeMode]);

  // Setup speech recognition with proper handlers
  const setupSpeechRecognition = (continuous = false) => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.warn('Error aborting existing recognition:', e);
      }
      recognitionRef.current = null;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = continuous;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      console.log('Speech recognition started, continuous mode:', continuous);
      setIsListening(true);
      setListeningStatus('listening');
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      
      if (!isProcessingRef.current && continuous && isHandsFreeMode) {
        console.log('Auto-restarting hands-free mode recognition');
        handsFreeTimerRef.current = setTimeout(() => {
          if (isHandsFreeMode) {
            try {
              recognition.start();
            } catch (e) {
              console.error('Error restarting recognition in hands-free mode:', e);
              setupSpeechRecognition(true);
            }
          }
        }, 250);
      } else if (!continuous) {
        setIsListening(false);
        setListeningStatus('idle');
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      if (event.error === 'no-speech' && continuous && isHandsFreeMode) {
        console.log('No speech detected, auto-restarting in hands-free mode');
        handsFreeTimerRef.current = setTimeout(() => {
          if (isHandsFreeMode) {
            try {
              recognition.start();
            } catch (e) {
              console.error('Error restarting after no-speech:', e);
              setupSpeechRecognition(true);
            }
          }
        }, 250);
      } else if (event.error === 'aborted') {
        console.log('Recognition aborted');
      } else {
        console.log('Recognition error, resetting hands-free if active');
        if (continuous && isHandsFreeMode) {
          handsFreeTimerRef.current = setTimeout(() => {
            if (isHandsFreeMode) {
              setupSpeechRecognition(true);
            }
          }, 1000);
        }
      }
      
      if (!continuous) {
        setIsListening(false);
        setListeningStatus('idle');
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      console.log('Recognition result:', transcript);
      
      if (continuous) {
        // For hands-free mode, look for wake word
        const lowerTranscript = transcript.toLowerCase();
        const wakeWordPatterns = [
          /hey\s+mise/i, 
          /hey\s+miss/i, 
          /hay\s+mise/i, 
          /hey\s+mees/i,
          /hey\s+meese/i,
          /hey\s+niece/i
        ];
        
        let hasWakeWord = false;
        let command = lowerTranscript;
        
        for (const pattern of wakeWordPatterns) {
          if (pattern.test(lowerTranscript)) {
            hasWakeWord = true;
            command = lowerTranscript.replace(pattern, '').trim();
            
            // Remove any leading punctuation
            command = command.replace(/^[,.!:;?]\s*/, '');
            break;
          }
        }
        
        if (hasWakeWord && command) {
          console.log('Wake word detected! Command:', command);
          
          // CRITICAL: Flag that we're processing to prevent auto-restart
          isProcessingRef.current = true;
          setProcessingVoiceCommand(true);
          setListeningStatus('processing');
          
          // Use abort() instead of stop() for more reliable behavior
          try {
            recognition.abort();
          } catch (e) {
            console.warn('Error aborting recognition:', e);
          }
          
          // Process the command
          handleVoiceQuery(command).then(() => {
            // Resume listening after command is processed
            console.log('Command processed, resuming hands-free mode');
            isProcessingRef.current = false;
            setProcessingVoiceCommand(false);
            
            // Slight delay to ensure any audio playback is complete
            setTimeout(() => {
              if (isHandsFreeMode) {
                setupSpeechRecognition(true);
              }
            }, 500);
          });
        } else {
          console.log('No wake word detected or empty command');
        }
      } else {
        // Normal mode - process any command directly
        handleVoiceQuery(transcript);
      }
    };
    
    recognitionRef.current = recognition;
    
    // Start recognition
    try {
      recognition.start();
      return true;
    } catch (e) {
      console.error('Error starting recognition:', e);
      return false;
    }
  };

  const handleCheckboxChange = (category, value) => {
    setFormData(prev => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter(item => item !== value)
        : [...prev[category], value]
    }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProgressImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProgressImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProgressImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const speakText = async (text) => {
    try {
      const openAIKey = import.meta.env.VITE_OPENAI_API_KEY;
      
      if (openAIKey) {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: text.substring(0, 4096),
            voice: 'nova',
            speed: 1.0
          })
        });

        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          return new Promise((resolve, reject) => {
            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
              resolve();
            };
            audio.onerror = (error) => {
              URL.revokeObjectURL(audioUrl);
              reject(error);
            };
            audio.play().catch(reject);
          });
        } else {
          throw new Error('OpenAI TTS failed');
        }
      } else {
        throw new Error('OpenAI API key not found');
      }
    } catch (error) {
      console.error('OpenAI TTS error, using fallback:', error);
      
      return new Promise((resolve) => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          
          utterance.onend = resolve;
          utterance.onerror = resolve;
          
          const setVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(voice => 
              voice.name.includes('Google') || 
              voice.name.includes('Microsoft') ||
              voice.name.includes('Natural') ||
              voice.name.includes('Samantha')
            ) || voices[0];
            
            if (preferredVoice) {
              utterance.voice = preferredVoice;
            }
            
            window.speechSynthesis.speak(utterance);
          };
          
          if (window.speechSynthesis.getVoices().length) {
            setVoice();
          } else {
            window.speechSynthesis.onvoiceschanged = setVoice;
          }
        } else {
          resolve();
        }
      });
    }
  };

  const startVoiceRecognition = () => {
    if (isListening) {
      stopVoiceRecognition();
    } else {
      setupSpeechRecognition(false);
    }
  };

  const stopVoiceRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
    }
    setIsListening(false);
    setListeningStatus('idle');
  };

  const toggleHandsFreeMode = () => {
    setIsHandsFreeMode(prevState => !prevState);
  };

  const handleVoiceQuery = async (query) => {
    if (!genAIRef.current) {
      alert('Please configure your Gemini API key!');
      return;
    }

    const newMessage = { role: 'user', content: query };
    setConversationHistory(prev => [...prev, newMessage]);

    const lowerQuery = query.toLowerCase();
    
    const processResponse = async (response) => {
      setConversationHistory(prev => [...prev, { role: 'assistant', content: response }]);
      await speakText(response);
    };
    
    if (lowerQuery.includes('next') || lowerQuery.includes('next step')) {
      if (currentStep < selectedRecipe.instructions.length - 1) {
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        const response = `Step ${nextStep + 1}: ${selectedRecipe.instructions[nextStep]}`;
        await processResponse(response);
      } else {
        const response = "You've reached the last step of the recipe.";
        await processResponse(response);
      }
    } else if (lowerQuery.includes('repeat') || lowerQuery.includes('again')) {
      const response = `Step ${currentStep + 1}: ${selectedRecipe.instructions[currentStep]}`;
      await processResponse(response);
    } else if (lowerQuery.includes('previous') || lowerQuery.includes('back')) {
      if (currentStep > 0) {
        const prevStep = currentStep - 1;
        setCurrentStep(prevStep);
        const response = `Step ${prevStep + 1}: ${selectedRecipe.instructions[prevStep]}`;
        await processResponse(response);
      } else {
        const response = "You're already at the first step.";
        await processResponse(response);
      }
    } else {
      try {
        const ingredientsList = selectedRecipe.ingredients?.map((ing, i) => `${i + 1}. ${ing}`).join('\n') || 'No ingredients list available';
        const allSteps = selectedRecipe.instructions?.map((step, i) => `${i + 1}. ${step}`).join('\n') || 'No instructions available';
        
        const prompt = `You are a helpful cooking assistant. The user is currently cooking "${selectedRecipe.name}".

FULL RECIPE CONTEXT:
Ingredients:
${ingredientsList}

All Steps:
${allSteps}

CURRENT STATUS:
- User is on step ${currentStep + 1}: "${selectedRecipe.instructions[currentStep]}"

USER QUESTION: "${query}"

Provide a concise, helpful answer to their question. If they're asking about ingredients, measurements, or steps, reference the full recipe information above. Keep your response conversational and under 100 words.`;
        
        const result = await genAIRef.current.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: prompt
        });
        
        const aiResponse = result.text;
        await processResponse(aiResponse);
      } catch (error) {
        console.error('Gemini API Error:', error);
        
        if (query.toLowerCase().includes('ingredient') || query.toLowerCase().includes('how much')) {
          const fallbackResponse = `Here are the ingredients for ${selectedRecipe.name}: ${selectedRecipe.ingredients?.join(', ') || 'No ingredients available'}`;
          await processResponse(fallbackResponse);
        } else {
          const errorMsg = 'Sorry, there was an error processing your request. Please try asking again.';
          await processResponse(errorMsg);
        }
      }
    }

    return true; // Indicate processing is complete
  };

  const generateRecipes = async () => {
    if (!genAIRef.current) {
      alert('Please configure your Gemini API key!');
      return;
    }

    setIsGenerating(true);

    try {
      let detectedIngredients = '';
      
      if (uploadedImageFile) {
        console.log('Analyzing uploaded image for ingredients...');
        
        const reader = new FileReader();
        const imageData = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(uploadedImageFile);
        });
        
        const base64Data = imageData.split(',')[1];
        
        const visionPrompt = 'List all the food ingredients you can identify in this image. Provide only the ingredient names, separated by commas. Be specific about what you see.';
        
        const visionResult = await genAIRef.current.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: [
            {
              role: 'user',
              parts: [
                { text: visionPrompt },
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: uploadedImageFile.type
                  }
                }
              ]
            }
          ]
        });
        
        detectedIngredients = visionResult.text;
        console.log('Detected ingredients:', detectedIngredients);
      }

      const prompt = `Generate 3 recipe suggestions based on the following criteria:
    ${formData.dishName ? `- Specific dish requested: ${formData.dishName}` : ''}
    ${formData.cookingTime ? `- Cooking time: ${formData.cookingTime}` : ''}
    - Type of dish: ${formData.dishType}
    ${formData.mood.length > 0 ? `- Mood/flavor profile: ${formData.mood.join(', ')}` : ''}
    ${formData.dietary.length > 0 ? `- Dietary preferences: ${formData.dietary.join(', ')}` : ''}
    ${formData.ingredients ? `- Available ingredients (text): ${formData.ingredients}` : ''}
    ${detectedIngredients ? `- Available ingredients (from image): ${detectedIngredients}` : ''}
    
    ${!formData.dishName && !formData.ingredients && !detectedIngredients ? 'Generate popular and versatile recipes.' : ''}
    
    For each recipe, provide:
    1. Recipe name
    2. Prep time
    3. Ingredients list
    4. Step-by-step instructions
    5. Difficulty level
    
    Format as JSON array with objects containing: name, prepTime, ingredients (array), instructions (array), difficulty`;

      const result = await genAIRef.current.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt
      });
      
      const responseText = result.text;
      
      let recipes = [];
      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          recipes = JSON.parse(jsonMatch[0]);
        } else {
          recipes = [{
            name: 'Generated Recipe',
            prepTime: formData.cookingTime || '30min',
            ingredients: (formData.ingredients || detectedIngredients || '').split(',').map(i => i.trim()).filter(i => i),
            instructions: responseText.split('\n').filter(line => line.trim()),
            difficulty: 'Medium'
          }];
        }
      } catch {
        recipes = [{
          name: 'Recipe Suggestion',
          prepTime: formData.cookingTime || '30min',
          ingredients: ['See details below'],
          instructions: [responseText],
          difficulty: 'Medium'
        }];
      }
      
      setGeneratedRecipes(recipes);
      setCurrentPage('recommendations');
    } catch (error) {
      console.error('Error generating recipes:', error);
      alert('Error generating recipes. Please check your API key and try again. Error: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const analyzeProgressImage = async () => {
    if (!progressImageFile || !genAIRef.current) {
      alert('Please upload an image first!');
      return;
    }

    setIsAnalyzingProgress(true);

    try {
      console.log('Analyzing cooking progress image...');
      
      const reader = new FileReader();
      const imageData = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(progressImageFile);
      });
      
      const base64Data = imageData.split(',')[1];
      
      const visionPrompt = `You are a helpful cooking assistant. The user is cooking "${selectedRecipe.name}" and is currently on step ${currentStep + 1}: "${selectedRecipe.instructions[currentStep]}".

They have uploaded an image of their cooking progress. Please analyze the image and provide feedback:
1. Does it look like they're on the right track for this step?
2. Are there any issues or concerns you notice?
3. Any tips or suggestions to improve?

Keep your response encouraging, concise, and helpful (under 150 words).`;
      
      const result = await genAIRef.current.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: [
          {
            role: 'user',
            parts: [
              { text: visionPrompt },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: progressImageFile.type
                }
              }
            ]
          }
        ]
      });
      
      const feedback = result.text;
      
      console.log('Progress feedback:', feedback);
      
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: '[Uploaded progress image]' },
        { role: 'assistant', content: feedback }
      ]);
      
      await speakText(feedback);
      
      setProgressImage(null);
      setProgressImageFile(null);
    } catch (error) {
      console.error('Error analyzing progress image:', error);
      alert('Error analyzing image. Please try again. Error: ' + error.message);
    } finally {
      setIsAnalyzingProgress(false);
    }
  };

  const startCooking = (recipe) => {
    setSelectedRecipe(recipe);
    setCurrentStep(0);
    setConversationHistory([]);
    setCurrentPage('cooking');
    setTimeout(() => {
      speakText(recipe.instructions[0]);
    }, 500);
  };

  if (currentPage === 'preferences') {
    return (
      <div className="cooking-assistant-container">
        <div className="cooking-assistant-wrapper">
          <div className="card header-card">
            <div className="header-content">
              <CookingPot className="header-icon" />
              <div>
                <h1 className="header-title">mise</h1>
                <p className="header-subtitle">cooking made simple, beautiful, and yours</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Select your Recipe Preferences</h2>
            
            <div className="form-group">
              <label className="form-label">Have a specific dish in mind? (Optional)</label>
              <input
                type="text"
                placeholder="e.g. chicken alfredo, chocolate cake, beef stew..."
                value={formData.dishName}
                onChange={(e) => setFormData(prev => ({ ...prev, dishName: e.target.value }))}
                className="select-field"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <Clock className="label-icon" />
                Maximum Cooking Time (Optional)
              </label>
              <select
                value={formData.cookingTime}
                onChange={(e) => setFormData(prev => ({ ...prev, cookingTime: e.target.value }))}
                className="select-field"
              >
                <option value="">Any time</option>
                <option value="30min">30 minutes</option>
                <option value="1hour">1 hour</option>
                <option value="2hours">2 hours</option>
                <option value="2+hours">2+ hours</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                <Utensils className="label-icon" />
                Type of Dish
              </label>
              <select
                value={formData.dishType}
                onChange={(e) => setFormData(prev => ({ ...prev, dishType: e.target.value }))}
                className="select-field"
              >
                <option value="appetizer">Appetizer</option>
                <option value="main course">Main Course</option>
                <option value="dessert">Dessert</option>
                <option value="snack">Snack</option>
                <option value="drinks">Drinks</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Mood (Optional)</label>
              <div className="checkbox-grid">
                {moodOptions.map(mood => (
                  <label key={mood} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.mood.includes(mood)}
                      onChange={() => handleCheckboxChange('mood', mood)}
                      className="checkbox-input"
                    />
                    <span className="checkbox-text">{mood}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Dietary Preferences (Optional)</label>
              <div className="checkbox-grid">
                {dietaryOptions.map(diet => (
                  <label key={diet} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.dietary.includes(diet)}
                      onChange={() => handleCheckboxChange('dietary', diet)}
                      className="checkbox-input"
                    />
                    <span className="checkbox-text">{diet}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Enter Ingredients (Optional)</label>
              <textarea
                placeholder="e.g. tomatoes, onions, chicken, ..."
                value={formData.ingredients}
                onChange={(e) => setFormData(prev => ({ ...prev, ingredients: e.target.value }))}
                rows={3}
                className="textarea-field"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Or Upload Image of Ingredients (Optional)</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="upload-button"
              >
                <Camera className="button-icon" />
                Choose Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              {uploadedImage && (
                <div className="image-preview-container">
                  <img src={uploadedImage} alt="Uploaded ingredients" className="image-preview" />
                </div>
              )}
            </div>

            <button
              onClick={generateRecipes}
              disabled={isGenerating}
              className={`submit-button ${isGenerating ? 'button-disabled' : ''}`}
            >
              {isGenerating ? 'Generating Recipes...' : 'Generate Recipes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentPage === 'recommendations') {
    return (
      <div className="cooking-assistant-container">
        <div className="cooking-assistant-wrapper">
          <div className="card header-card">
            <div className="header-content">
              <CookingPot className="header-icon" />
              <div>
                <h1 className="header-title">mise</h1>
                <p className="header-subtitle">cooking made simple, beautiful, and yours</p>
              </div>
            </div>
          </div>

          <div className="card">
            <button
              onClick={() => setCurrentPage('preferences')}
              className="back-button"
            >
              <ArrowLeft className="button-icon" />
              Back to Preferences
            </button>

            <h2 className="section-title">Your Recipes</h2>
            <div className="recipes-container">
              {generatedRecipes.map((recipe, idx) => (
                <div key={idx} className="recipe-card">
                  <h3 className="recipe-title">{recipe.name}</h3>
                  <p className="recipe-meta">⏱ {recipe.prepTime} | 📊 {recipe.difficulty}</p>
                  <div className="recipe-section">
                    <h4 className="recipe-subtitle">Ingredients:</h4>
                    <ul className="recipe-list">
                      {recipe.ingredients?.map((ing, i) => (
                        <li key={i}>{ing}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="recipe-section">
                    <h4 className="recipe-subtitle">Instructions:</h4>
                    <ol className="recipe-list recipe-list-numbered">
                      {recipe.instructions?.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <button
                    onClick={() => startCooking(recipe)}
                    className="submit-button"
                  >
                    Start Cooking This Recipe
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentPage === 'cooking') {
    return (
      <div className="cooking-assistant-container">
        <div className="cooking-assistant-wrapper">
          <div className="card header-card">
            <div className="header-content">
              <CookingPot className="header-icon" />
              <div>
                <h1 className="header-title">mise</h1>
                <p className="header-subtitle">cooking made simple, beautiful, and yours</p>
              </div>
            </div>
          </div>

          <div className="card">
            <button
              onClick={() => setCurrentPage('recommendations')}
              className="back-button"
            >
              <ArrowLeft className="button-icon" />
              Back to Recipes
            </button>

            <h2 className="section-title">Now Cooking: {selectedRecipe.name}</h2>
            <p className="section-description">Feel free to ask questions!</p>

            {/* Ingredients List */}
            <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#fef3c7', borderRadius: '0.5rem', border: '2px solid #fbbf24' }}>
              <h3 className="section-title" style={{ marginTop: 0, marginBottom: '1rem' }}>Ingredients</h3>
              <ul className="recipe-list">
                {selectedRecipe.ingredients?.map((ing, i) => (
                  <li key={i} style={{ marginBottom: '0.5rem' }}>{ing}</li>
                ))}
              </ul>
            </div>

            {/* Current Step Display */}
            <div className="current-step-container">
              <div className="step-header">
                <span className="step-counter">Step {currentStep + 1} of {selectedRecipe.instructions.length}</span>
                <div className="step-navigation">
                  <button
                    onClick={() => {
                      if (currentStep > 0) {
                        const prevStep = currentStep - 1;
                        setCurrentStep(prevStep);
                        speakText(selectedRecipe.instructions[prevStep]);
                      }
                    }}
                    disabled={currentStep === 0}
                    className="step-nav-button"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      if (currentStep < selectedRecipe.instructions.length - 1) {
                        const nextStep = currentStep + 1;
                        setCurrentStep(nextStep);
                        speakText(selectedRecipe.instructions[nextStep]);
                      }
                    }}
                    disabled={currentStep === selectedRecipe.instructions.length - 1}
                    className="step-nav-button"
                  >
                    Next
                  </button>
                </div>
              </div>
              <p className="current-step-text">{selectedRecipe.instructions[currentStep]}</p>
            </div>

            <h3 className="section-title" style={{ marginTop: '2rem' }}>Voice Assistant</h3>
            
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                onClick={toggleHandsFreeMode}
                className={`upload-button ${isHandsFreeMode ? 'voice-button-active' : ''}`}
                style={{ flex: '1' }}
              >
                {isHandsFreeMode ? '🎤 Hands-Free Mode: ON' : '🎤 Hands-Free Mode: OFF'}
              </button>
            </div>

            {isHandsFreeMode && (
              <div style={{ 
                padding: '1rem', 
                backgroundColor: '#fff7ed', 
                borderRadius: '0.5rem', 
                marginBottom: '1rem',
                border: '2px solid #fb923c'
              }}>
                {listeningStatus === 'processing' ? (
                  <p style={{ margin: 0, color: '#b45309', fontWeight: '600' }}>
                    ⏳ Processing your "Hey, Mise!" command...
                  </p>
                ) : (
                  <p style={{ margin: 0, color: '#ea580c', fontWeight: '600' }}>
                    🎤 Listening for "Hey, Mise!" commands...
                  </p>
                )}
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#9a3412' }}>
                  Say "Hey, Mise!" followed by your question
                </p>
              </div>
            )}
            
            {!isHandsFreeMode && (
              <button
                onClick={startVoiceRecognition}
                className={`voice-button ${isListening ? 'voice-button-active' : ''}`}
              >
                {isListening ? (
                  <>
                    <MicOff className="button-icon" />
                    Stop Listening
                  </>
                ) : (
                  <>
                    <Mic className="button-icon" />
                    Start Voice Input
                  </>
                )}
              </button>
            )}

            <p className="section-description" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
              {isHandsFreeMode 
                ? 'Example: "Hey, Mise! What temperature should I use?" or "Hey, Mise! Next step"'
                : 'Try saying: "Next step" • "Repeat that" • "What heat level?" • "How do I know when it\'s done?"'
              }
            </p>

            <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
              <h3 className="section-title">Check Your Cooking Progress</h3>
              <p className="section-description" style={{ marginBottom: '1rem' }}>
                Upload a photo of your current cooking step and get feedback!
              </p>
              
              <button
                onClick={() => progressImageInputRef.current?.click()}
                className="upload-button"
              >
                <Camera className="button-icon" />
                Upload Progress Photo
              </button>
              <input
                ref={progressImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleProgressImageUpload}
                style={{ display: 'none' }}
              />
              
              {progressImage && (
                <div style={{ marginTop: '1rem' }}>
                  <div className="image-preview-container">
                    <img src={progressImage} alt="Cooking progress" className="image-preview" />
                  </div>
                  <button
                    onClick={analyzeProgressImage}
                    disabled={isAnalyzingProgress}
                    className={`submit-button ${isAnalyzingProgress ? 'button-disabled' : ''}`}
                    style={{ marginTop: '1rem' }}
                  >
                    {isAnalyzingProgress ? 'Analyzing...' : 'Get Feedback on This Photo'}
                  </button>
                </div>
              )}
            </div>

            {conversationHistory.length > 0 && (
              <div className="conversation-container">
                {conversationHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`message ${msg.role === 'user' ? 'message-user' : 'message-assistant'}`}
                  >
                    <p className="message-role">
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </p>
                    <p className="message-content">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '2rem' }}>
              <h3 className="section-title">All Steps</h3>
              <ol className="recipe-list recipe-list-numbered">
                {selectedRecipe.instructions.map((step, i) => (
                  <li
                    key={i}
                    style={{
                      backgroundColor: i === currentStep ? '#fff7ed' : 'transparent',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      fontWeight: i === currentStep ? '600' : '400'
                    }}
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}