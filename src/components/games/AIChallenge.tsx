'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface AIChallengeProps {
  onGameOver: (score: number) => void;
  onStart: () => void;
  disabled?: boolean; // Indicates if the player has already played in this room
  isCreator?: boolean; // Indicates if the player created this room
  inRoom?: boolean; // Indicates if the game is being played in a room
}

// Import Google Generative AI library
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

export default function AIChallenge({ onGameOver, onStart, disabled = false, isCreator = false, inRoom = false }: AIChallengeProps) {
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'gameOver'>('ready');
  const [targetWord, setTargetWord] = useState<string>('');
  const [userMessage, setUserMessage] = useState<string>('');
  const [aiResponses, setAiResponses] = useState<{message: string, timestamp: string}[]>([]);
  const [timer, setTimer] = useState<number>(60);
  const [score, setScore] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [wordList, setWordList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const responsesRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Modify the disabled check to only apply when in a room
  const isPlayDisabled = inRoom && disabled && !isCreator;

  // Single word list with a good mix of difficulty levels
  const gameWords = [
    'banana', 'apple', 'orange', 'pizza', 'music', 
    'happy', 'smile', 'party', 'dance', 'beach',
    'elephant', 'adventure', 'treasure', 'journey', 'festival',
    'diamond', 'mystery', 'horizon', 'algorithm', 'philosophy',
    'universe', 'challenge', 'victory', 'harmony', 'pioneer',
    'creativity', 'imagination', 'enthusiasm', 'paradox', 'miracle'
  ];

  // Load words on component mount
  useEffect(() => {
    setWordList(gameWords);
  }, []);

  // Start a new game
  const startGame = () => {
    if (isPlayDisabled) return;
    
    onStart();
    
    // Initialize game state
    setGameState('playing');
    setTimer(60);
    setScore(1);
    setAiResponses([]);
    
    // Select a random word from our single list
    const randomWord = gameWords[Math.floor(Math.random() * gameWords.length)];
    setTargetWord(randomWord);
    
    console.log(`Game started with target word: ${randomWord}`);
    
    // Start the timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    timerIntervalRef.current = setInterval(() => {
      setTimer(prevTimer => {
        if (prevTimer <= 1) {
          // Time's up
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
          }
          
          // End the game with current score if timer reaches 0
          endGame(0);
          return 0;
        }
        return prevTimer - 1;
      });
    }, 1000);
    
    // Focus the input
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // End the game
  const endGame = (finalScore: number) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    setGameState('gameOver');
    onGameOver(finalScore);
  };

  // Reset the game
  const resetGame = () => {
    setGameState('ready');
    setUserMessage('');
    setAiResponses([]);
    setError(null);
  };

  // Call Gemini API
  const callGeminiAPI = async (message: string, targetWord: string): Promise<string> => {
    try {
      // Setup the Gemini API client
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      
      if (!apiKey) {
        console.warn("No Gemini API key found in environment variables");
        throw new Error("API key not configured");
      }
      
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });
      
      // Prepare generation config
      const generationConfig = {
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 200,
      };

      // Prepare the prompt
      const prompt = `You are having a natural conversation. You must never use the word "${targetWord}" in your response. Keep your response conversational and concise (1-3 sentences). 

User message: ${message}`;

      // Generate the response
      const result = await model.generateContent(prompt);
      const aiResponse = result.response.text();
      
      // For challenging gameplay, occasionally inject the target word
      // The chance increases as time runs out to ensure the game is winnable
      const timeLeft = timer;
      const chanceToSayWord = Math.max(0.1, Math.min(0.7, 1 - (timeLeft / 60)));
      
      // Get word difficulty modifier - harder words have higher chance
      const difficultyModifier = 1.0;
      
      if (Math.random() < chanceToSayWord * difficultyModifier) {
        // This is directly connected to difficulty - we want to ensure game is beatable but challenging
        // For this, we craft responses that naturally include the target word
        const insertWordResponses = [
          `I was thinking about ${targetWord} the other day. It's quite interesting.`,
          `Have you ever considered how important ${targetWord} is in our daily lives?`,
          `That reminds me of something related to ${targetWord}.`,
          `Interesting question! It makes me think about ${targetWord}.`,
          `I believe ${targetWord} could be relevant to this discussion.`,
          `My thoughts on that connect strongly to the concept of ${targetWord}.`,
          `It's worth considering ${targetWord} as part of the equation here.`
        ];
        return insertWordResponses[Math.floor(Math.random() * insertWordResponses.length)];
      }
      
      return aiResponse;
      
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      setError(`API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "I seem to be having technical difficulties. Let's try a different topic.";
    }
  };

  // Fallback function if API is unavailable (for testing/development)
  const getFallbackResponse = (message: string, targetWord: string): string => {
    const lowerMessage = message.toLowerCase();
    const lowerTarget = targetWord.toLowerCase();
    
    // If the user mentions the word directly, the AI tries to avoid it
    if (lowerMessage.includes(lowerTarget)) {
      return `I notice you're bringing up an interesting topic. I'd rather talk about something else though.`;
    }
    
    // If the user is trying to trick the AI directly
    if (lowerMessage.includes('say') || lowerMessage.includes('repeat') || lowerMessage.includes('write')) {
      return "I'm not going to simply repeat words. Let's have a genuine conversation!";
    }
    
    // Randomly decide if the AI will say the target word (more likely as the game progresses)
    const timeLeft = timer;
    const chanceToSayWord = Math.max(0.1, Math.min(0.8, 1 - (timeLeft / 60)));
    
    // Difficulty modifier
    const difficultyModifier = 1.0;
    
    if (Math.random() < chanceToSayWord * difficultyModifier) {
      // Generate a response that naturally includes the target word
      const responses = [
        `I was thinking about ${targetWord} the other day. It's quite interesting.`,
        `Have you ever considered how important ${targetWord} is in our daily lives?`,
        `That reminds me of something related to ${targetWord}.`,
        `Interesting question! It makes me think about ${targetWord}.`,
        `I believe ${targetWord} could be relevant to this discussion.`
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Otherwise, give a normal response that avoids the target word
    const normalResponses = [
      "That's an interesting point. Can you tell me more?",
      "I'm not sure I understand what you're getting at. Could you elaborate?",
      "I find that topic quite fascinating. What else would you like to discuss?",
      "That's a good question. I'd need to think about it more.",
      "I appreciate your perspective on this matter. Let's continue our conversation.",
      "I'm enjoying our discussion. What else is on your mind?",
      "Could you share more of your thoughts on this subject?",
      "I'm curious to hear more about your viewpoint.",
      "Let's explore this topic further. What specific aspects interest you?",
      "That's a unique way of looking at things. I'd like to hear more."
    ];
    
    return normalResponses[Math.floor(Math.random() * normalResponses.length)];
  };

  // Handle user message submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userMessage.trim() || isLoading || gameState !== 'playing') return;
    
    setIsLoading(true);
    
    // Add user message to the conversation
    const newResponses = [
      ...aiResponses, 
      { 
        message: `You: ${userMessage}`, 
        timestamp: new Date().toLocaleTimeString() 
      }
    ];
    setAiResponses(newResponses);
    
    try {
      // First check if the user is directly asking for the target word
      const lowerMessage = userMessage.toLowerCase();
      const lowerTarget = targetWord.toLowerCase();
      
      // If the user message contains the target word, immediately penalize
      if (lowerMessage.includes(lowerTarget)) {
        setAiResponses([
          ...newResponses, 
          { 
            message: `AI: I notice you used the word "${targetWord}" yourself! That's against the rules.`, 
            timestamp: new Date().toLocaleTimeString() 
          }
        ]);
      } else {
        // Call Gemini API (or fallback if API key is not set)
        let aiResponse;
        try {
          aiResponse = await callGeminiAPI(userMessage, targetWord);
        } catch (apiError) {
          console.warn("Using fallback due to API error:", apiError);
          aiResponse = getFallbackResponse(userMessage, targetWord);
        }
        
        // Add AI response to the conversation
        setAiResponses([
          ...newResponses, 
          { 
            message: `AI: ${aiResponse}`, 
            timestamp: new Date().toLocaleTimeString() 
          }
        ]);
        
        // Check if the AI said the target word
        if (containsTargetWord(aiResponse, targetWord)) {
          // Calculate score using our new function
          const finalScore = calculateScore(timer);
          
          // Update score
          setScore(finalScore);
          
          // Wait a moment before ending the game so the user can see they succeeded
          setTimeout(() => {
            // End game with success
            endGame(finalScore);
          }, 1500);
        }
      }
      
      // Clear user message
      setUserMessage('');
      
    } catch (error) {
      console.error('Error in AI Challenge game:', error);
      setAiResponses([
        ...newResponses, 
        { 
          message: 'AI: Sorry, I encountered an error. Please try again.', 
          timestamp: new Date().toLocaleTimeString() 
        }
      ]);
    } finally {
      setIsLoading(false);
      
      // Scroll to the bottom of the conversation
      if (responsesRef.current) {
        responsesRef.current.scrollTop = responsesRef.current.scrollHeight;
      }
      
      // Focus the input again
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  // Check if the AI response contains the target word
  const containsTargetWord = (response: string, word: string): boolean => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(response);
  };

  // Format the timer display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Update the score calculation for the single difficulty
  const calculateScore = (remainingTime: number): number => {
    // Base score of 100
    const baseScore = 100;
    
    // Time bonus is 1.5x remaining time
    const timeBonus = Math.floor(remainingTime * 1.5);
    
    // Fixed bonus of 100 points
    const fixedBonus = 100;
    
    // Final score (at least 1)
    return Math.max(1, baseScore + timeBonus + fixedBonus);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-gray-900 rounded-xl shadow-lg overflow-hidden">
      {gameState === 'ready' ? (
        <div className="p-6 flex flex-col items-center">
          <h2 className="text-2xl font-bold text-white mb-4">AI CHALLENGE</h2>
          
          <p className="text-gray-300 text-center mb-6">
            Try to trick the AI into saying a specific word. You win when the AI says your target word!
          </p>
          
          {isPlayDisabled ? (
            <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6 text-center">
              <p className="text-red-400">You have already played in this room!</p>
              <p className="text-gray-400 text-sm mt-2">Each player can only submit one score per room.</p>
            </div>
          ) : inRoom && isCreator ? (
            <div className="bg-green-900/30 border border-green-500 rounded-lg p-4 mb-6 text-center">
              <p className="text-green-400">You are the room creator</p>
              <p className="text-gray-400 text-sm mt-2">Set your score to challenge other players!</p>
            </div>
          ) : null}
          
          <button 
            onClick={startGame}
            disabled={isPlayDisabled}
            className={`bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all duration-300 ${
              isPlayDisabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            Start Game
          </button>
        </div>
      ) : gameState === 'playing' ? (
        <div className="bg-black/60 border-2 border-neon-blue rounded-lg p-4 md:p-6 shadow-lg shadow-neon-blue/20">
          {/* Game content based on state */}
          <div>
            <div className="bg-black/80 border border-neon-pink p-4 rounded-md mb-4 text-center">
              <p className="text-gray-300 mb-2">Your target word is:</p>
              <h3 className="font-arcade text-2xl mb-2">
                <span className="text-neon-pink">
                  {targetWord.toUpperCase()}
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                Try to make the AI say this word without using it yourself
              </p>
            </div>
            
            <div 
              ref={responsesRef}
              className="bg-gray-900/50 rounded-md p-4 h-64 overflow-y-auto mb-4"
            >
              {aiResponses.length === 0 ? (
                <div className="text-center text-gray-500 h-full flex items-center justify-center">
                  <p>Begin the conversation to trick the AI!</p>
                </div>
              ) : (
                aiResponses.map((response, index) => (
                  <div key={index} className="mb-3">
                    <div className={`${
                      response.message.startsWith('You:') 
                        ? 'text-neon-green' 
                        : 'text-neon-blue'
                    } text-sm`}>
                      {response.message}
                    </div>
                    <div className="text-gray-500 text-xs">{response.timestamp}</div>
                  </div>
                ))
              )}
              
              {isLoading && (
                <div className="text-neon-blue text-sm">
                  AI is thinking<span className="typing-dots"></span>
                </div>
              )}
            </div>
            
            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                ref={inputRef}
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                placeholder="Type your message here..."
                className="flex-grow bg-black border-2 border-neon-green text-white p-2 rounded-md focus:outline-none focus:border-neon-blue resize-none"
                rows={2}
                disabled={isLoading || gameState !== 'playing'}
              />
              <button 
                type="submit"
                className="arcade-button-green self-end"
                disabled={isLoading || !userMessage.trim() || gameState !== 'playing'}
              >
                SEND
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="p-6 flex flex-col items-center">
          <h2 className="text-2xl font-bold text-white mb-2">Game Over!</h2>
          
          <div className="bg-black/30 p-6 rounded-lg w-full max-w-md my-6 text-center">
            <p className="text-lg text-gray-300 mb-2">
              Your word was: <span className="text-purple-400 font-bold">{targetWord}</span>
            </p>
            <p className="text-lg text-gray-300 mb-4">
              Your score: <span className="text-green-400 font-bold">{score}</span>
            </p>
            
            {inRoom ? (
              <p className="text-yellow-400 mt-4">Score submitted!</p>
            ) : (
              <button 
                onClick={resetGame}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-2 px-6 rounded-full shadow-lg hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-all duration-300"
              >
                Play Again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}