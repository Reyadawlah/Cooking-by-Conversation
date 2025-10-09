import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Clock, Utensils, CookingPot, ArrowLeft } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import './CookingAssistant.css';

export default function CookingAssistant() {
  const [currentPage, setCurrentPage] = useState('preferences'); // preferences, recommendations, cooking
  const [formData, setFormData] = useState({
    cookingTime: '30min',
    dishType: 'main course',
    mood: [],
    dietary: [],
    ingredients: ''
  });
  
  const [uploadedImage, setUploadedImage] = useState(null);
  const [generatedRecipes, setGeneratedRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const genAIRef = useRef(null);

  const moodOptions = ['spicy', 'comfort food', 'healthy', 'cheesy', 'sour', 'sweet'];
  const dietaryOptions = ['high-protein', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'none'];

  // Initialize Gemini AI client
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey) {
      genAIRef.current = new GoogleGenAI({ apiKey });
    } else {
      console.error('VITE_GEMINI_API_KEY not found in environment variables');
    }
  }, []);

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
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startVoiceRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        handleVoiceQuery(transcript);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.start();
    } else {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
    }
  };

  const stopVoiceRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleVoiceQuery = async (query) => {
    if (!genAIRef.current) {
      alert('Please configure your Gemini API key!');
      return;
    }

    const newMessage = { role: 'user', content: query };
    setConversationHistory(prev => [...prev, newMessage]);

    // Handle navigation commands
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('next') || lowerQuery.includes('next step')) {
      if (currentStep < selectedRecipe.instructions.length - 1) {
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        speakText(selectedRecipe.instructions[nextStep]);
        setConversationHistory(prev => [...prev, { 
          role: 'assistant', 
          content: selectedRecipe.instructions[nextStep] 
        }]);
        return;
      }
    } else if (lowerQuery.includes('repeat') || lowerQuery.includes('again')) {
      speakText(selectedRecipe.instructions[currentStep]);
      setConversationHistory(prev => [...prev, { 
        role: 'assistant', 
        content: selectedRecipe.instructions[currentStep] 
      }]);
      return;
    } else if (lowerQuery.includes('previous') || lowerQuery.includes('back')) {
      if (currentStep > 0) {
        const prevStep = currentStep - 1;
        setCurrentStep(prevStep);
        speakText(selectedRecipe.instructions[prevStep]);
        setConversationHistory(prev => [...prev, { 
          role: 'assistant', 
          content: selectedRecipe.instructions[prevStep] 
        }]);
        return;
      }
    }

    // General cooking questions using new Gemini SDK
    try {
      const response = await genAIRef.current.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: `You are a helpful cooking assistant. The user is currently cooking ${selectedRecipe.name} and is on step ${currentStep + 1}: "${selectedRecipe.instructions[currentStep]}". They are asking: ${query}. Provide a concise and helpful answer.`
      });
      
      const aiResponse = response.text;
      
      setConversationHistory(prev => [...prev, { role: 'assistant', content: aiResponse }]);
      speakText(aiResponse);
    } catch (error) {
      console.error('Error:', error);
      const errorMsg = 'Sorry, there was an error processing your request.';
      setConversationHistory(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      speakText(errorMsg);
    }
  };

  const generateRecipes = async () => {
    if (!genAIRef.current) {
      alert('Please configure your Gemini API key!');
      return;
    }

    if (!formData.ingredients && !uploadedImage) {
      alert('Please enter ingredients or upload an image!');
      return;
    }

    setIsGenerating(true);

    const prompt = `Generate 3 recipe suggestions based on the following criteria:
    - Cooking time: ${formData.cookingTime}
    - Type of dish: ${formData.dishType}
    - Mood/flavor profile: ${formData.mood.join(', ') || 'any'}
    - Dietary preferences: ${formData.dietary.join(', ') || 'none'}
    - Available ingredients: ${formData.ingredients}
    ${uploadedImage ? '- (User also provided an image of ingredients)' : ''}
    
    For each recipe, provide:
    1. Recipe name
    2. Prep time
    3. Ingredients list
    4. Step-by-step instructions
    5. Difficulty level
    
    Format as JSON array with objects containing: name, prepTime, ingredients (array), instructions (array), difficulty`;

    try {
      const response = await genAIRef.current.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt
      });
      
      const responseText = response.text;
      
      let recipes = [];
      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          recipes = JSON.parse(jsonMatch[0]);
        } else {
          recipes = [{
            name: 'Generated Recipe',
            prepTime: formData.cookingTime,
            ingredients: formData.ingredients.split(',').map(i => i.trim()),
            instructions: responseText.split('\n').filter(line => line.trim()),
            difficulty: 'Medium'
          }];
        }
      } catch {
        recipes = [{
          name: 'Recipe Suggestion',
          prepTime: formData.cookingTime,
          ingredients: ['See details below'],
          instructions: [responseText],
          difficulty: 'Medium'
        }];
      }
      
      setGeneratedRecipes(recipes);
      setCurrentPage('recommendations');
    } catch (error) {
      console.error('Error generating recipes:', error);
      alert('Error generating recipes. Please check your API key and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const startCooking = (recipe) => {
    setSelectedRecipe(recipe);
    setCurrentStep(0);
    setConversationHistory([]);
    setCurrentPage('cooking');
    // Read first instruction aloud
    setTimeout(() => {
      speakText(recipe.instructions[0]);
    }, 500);
  };

  // PAGE 1: PREFERENCES
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
              <label className="form-label">
                <Clock className="label-icon" />
                Maximum Cooking Time
              </label>
              <select
                value={formData.cookingTime}
                onChange={(e) => setFormData(prev => ({ ...prev, cookingTime: e.target.value }))}
                className="select-field"
              >
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
              <label className="form-label">Mood</label>
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
              <label className="form-label">Dietary Preferences</label>
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
              <label className="form-label">Enter Ingredients</label>
              <textarea
                placeholder="e.g. tomatoes, onions, chicken, ..."
                value={formData.ingredients}
                onChange={(e) => setFormData(prev => ({ ...prev, ingredients: e.target.value }))}
                rows={3}
                className="textarea-field"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Or Upload Image of Ingredients</label>
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

  // PAGE 2: RECOMMENDATIONS
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

  // PAGE 3: COOKING MODE
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

            {/* Voice Assistant */}
            <h3 className="section-title" style={{ marginTop: '2rem' }}>Voice Assistant</h3>
            
            <button
              onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
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

            <p className="section-description" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
              Try saying: "Next step" • "Repeat that" • "What heat level?" • "How do I know when it's done?"
            </p>

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

            {/* All Steps Reference */}
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
}