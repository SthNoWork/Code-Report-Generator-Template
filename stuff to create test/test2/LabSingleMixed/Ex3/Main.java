import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        String text = "the quick brown fox jumps over the lazy dog";
        Map<String, Integer> wordCount = new HashMap<>();
        
        for (String word : text.split(" ")) {
            wordCount.put(word, wordCount.getOrDefault(word, 0) + 1);
        }
        
        wordCount.forEach((word, count) -> 
            System.out.println(word + ": " + count)
        );
    }
}
